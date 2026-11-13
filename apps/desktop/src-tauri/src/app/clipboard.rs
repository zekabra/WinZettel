use arboard::Clipboard;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use tauri::command;

/// Read the clipboard text with the Windows API itself.
///
/// `arboard` answers with nothing when the clipboard also carries rich content (a page copied
/// from a browser, for example): the owner publishes `CF_HTML` and the text format is either
/// delayed or offered in a shape the crate does not ask for. Every editor reads that same
/// clipboard correctly, so this asks Windows directly, retrying while another process holds it.
#[cfg(windows)]
fn read_text_with_windows_api() -> Option<String> {
    use std::ptr;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    const CF_UNICODETEXT: u32 = 13;
    const CF_TEXT: u32 = 1;

    unsafe fn read_format(format: u32) -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(format) == 0 {
                return None;
            }
            let handle = GetClipboardData(format);
            if handle.is_null() {
                return None;
            }
            let pointer = GlobalLock(handle) as *const u8;
            if pointer.is_null() {
                return None;
            }

            let text = if format == 13 {
                let wide = pointer as *const u16;
                let mut length = 0usize;
                while *wide.add(length) != 0 {
                    length += 1;
                    if length > 32 * 1024 * 1024 {
                        break;
                    }
                }
                let slice = std::slice::from_raw_parts(wide, length);
                String::from_utf16(slice).ok()
            } else {
                let mut length = 0usize;
                while *pointer.add(length) != 0 {
                    length += 1;
                    if length > 32 * 1024 * 1024 {
                        break;
                    }
                }
                let slice = std::slice::from_raw_parts(pointer, length);
                Some(String::from_utf8_lossy(slice).into_owned())
            };

            GlobalUnlock(handle);
            text.filter(|value| !value.is_empty())
        }
    }

    unsafe {
        let mut opened = false;
        for _ in 0..20 {
            if OpenClipboard(ptr::null_mut()) != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        if !opened {
            return None;
        }
        let text = read_format(CF_UNICODETEXT).or_else(|| read_format(CF_TEXT));
        CloseClipboard();
        text
    }
}

#[cfg(not(windows))]
fn read_text_with_windows_api() -> Option<String> {
    None
}

#[command]
pub fn get_clipboard_html() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    let html_data = clipboard.get().html();
    match html_data {
        Ok(data) => Ok(data),
        Err(_) => Err("Clipboard does not contain HTML data.".to_string()),
    }
}

#[command]
pub fn get_clipboard_text() -> Result<String, String> {
    // Ask the crate first: it is the cheapest path when the clipboard only holds text.
    if let Ok(mut clipboard) = Clipboard::new() {
        if let Ok(text) = clipboard.get_text() {
            if !text.is_empty() {
                return Ok(text);
            }
        }
    }

    if let Some(text) = read_text_with_windows_api() {
        return Ok(text);
    }

    Err("Clipboard does not contain text data.".to_string())
}

/// The clipboard image, as raw RGBA pixels the webview can turn into a PNG.
///
/// Copying a picture from a browser puts a bitmap on the clipboard, not a file, so the
/// context-menu paste had nothing to work with. Returning the pixels keeps the encoding in the
/// webview, where a canvas already knows how to do it.
#[command]
pub fn get_clipboard_image() -> Result<ClipboardImage, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let image = clipboard.get_image().map_err(|_| "Clipboard does not contain an image.".to_string())?;

    Ok(ClipboardImage {
        width: image.width,
        height: image.height,
        rgba: BASE64.encode(image.bytes.into_owned()),
    })
}

#[derive(serde::Serialize)]
pub struct ClipboardImage {
    pub width: usize,
    pub height: usize,
    pub rgba: String,
}
