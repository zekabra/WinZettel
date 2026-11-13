import { PageLayout } from '@/components/Layout'
import { Separator } from 'react-resizable-panels'
import styled from 'styled-components'

export const RootPageLayout = styled(PageLayout)`
  position: relative;
  width: 100%;
  height: 100%;
  border-top: 0;

  @supports selector(:has([aria-expanded='true'])) {
    @media (hover: hover) and (pointer: fine) {
      &[data-mf-single-document] {
        /* Keep editor stacking below the toolbar without raising it above portals. */
        > [data-group] {
          isolation: isolate;

          /* Fullscreen previews must still cover the title bar outside Root. */
          body.mf-livepreview-fullscreen-active & {
            isolation: auto;
          }
        }

        > .app-status-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: var(--mf-ui-status-bar-height);
          pointer-events: none;

          /* Overlay the full-height editor and docks; observe pointer proximity
             from Root so the hidden toolbar does not intercept editor input. */
          > [role='toolbar'] {
            position: absolute;
            top: auto;
            bottom: 0;
            opacity: 0;
            pointer-events: none;
          }

          &[data-mf-status-bar-hover] > [role='toolbar'],
          &[data-mf-dock-dragging] > [role='toolbar'],
          &:focus-within > [role='toolbar'],
          &:has([aria-expanded='true']) > [role='toolbar'] {
            opacity: 1;
            pointer-events: auto;
          }

          @media (prefers-reduced-motion: no-preference) {
            > [role='toolbar'] {
              transform: translateY(6px);
              transition:
                opacity var(--mf-motion-duration-fast, 100ms)
                  var(--mf-motion-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
                transform var(--mf-motion-duration-fast, 100ms)
                  var(--mf-motion-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
            }

            &[data-mf-status-bar-hover] > [role='toolbar'],
            &[data-mf-dock-dragging] > [role='toolbar'],
            &:focus-within > [role='toolbar'],
            &:has([aria-expanded='true']) > [role='toolbar'] {
              transform: translateY(0);
              transition-duration: var(--mf-motion-duration-overlay, 120ms),
                var(--mf-motion-duration-base, 180ms);
            }

            /* Focus and open menus need their final position immediately. */
            &[data-mf-dock-dragging] > [role='toolbar'],
            &:focus-within > [role='toolbar'],
            &:has([aria-expanded='true']) > [role='toolbar'] {
              transition: none;
            }
          }
        }
      }
    }
  }

  &[data-mf-zen-mode] {
    #root-left,
    #root-right,
    [data-mf-root-separator],
    .app-status-bar {
      display: none !important;
    }

    #root-center {
      flex: 1 1 100% !important;
      width: 100%;
    }
  }
`

export const StyleSeparator = styled(Separator)`
  /* The handle is a painted strip the width of the gesture, not an invisible overlay: an
     overlay wide enough to grab also covered the adjacent scrollbar, which then could not be
     dragged. The visible rule is drawn inside it. */
  width: 6px;
  flex: 0 0 6px;
  position: relative;
  z-index: 2;
  border: 0;
  cursor: col-resize !important;
  touch-action: none;
  user-select: none;
  background-color: var(--mf-dock-surface, var(--mf-surface-panel, transparent));

  &::before {
    content: '';
    position: absolute;
    inset-block: 0;
    left: 50%;
    width: 1px;
    transform: translateX(-50%);
    background-color: var(--mf-ui-border-subtle);
    transition: background-color var(--mf-motion-duration-fast, 120ms)
      var(--mf-motion-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  }

  &[data-mf-hidden] {
    display: none;
  }

  &:hover::before,
  &:focus-visible::before {
    background-color: var(--mf-control-focus);
  }

  &[data-separator='hover']::before,
  &[data-separator='active']::before {
    background-color: ${(props) => props.theme.accentColor};
  }

  &:focus-visible {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
