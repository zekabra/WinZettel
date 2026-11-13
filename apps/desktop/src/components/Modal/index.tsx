import { Confirm } from './Confirm'
import { ImageInsert } from './ImageInsert'
import { Info } from './Info'
import { InputConfirm } from './InputConfirm'
import { RepoCreate } from './RepoCreate'
import { RepoUnlock } from './RepoUnlock'

export {
  Confirm,
  ConfirmModal,
  MODAL_CONFIRM_ID,
  type ConfirmModalProps,
  type DialogAction,
  type DialogRememberOptions,
} from './Confirm'
export { Info, InfoModal, MODAL_INFO_ID, type InfoModalProps } from './Info'
export {
  ImageInsert,
  ImageInsertModal,
  MODAL_IMAGE_INSERT_ID,
  type ImageInsertSelection,
} from './ImageInsert'
export { RepoCreate, MODAL_REPO_CREATE_ID, type RepoCreateResult } from './RepoCreate'
export { RepoUnlock, RepoUnlockModal, MODAL_REPO_UNLOCK_ID, type RepoUnlockModalProps } from './RepoUnlock'
export {
  InputConfirm,
  InputConfirmModal,
  MODAL_INPUT_ID,
  type InputConfirmModalProps,
} from './InputConfirm'

export const Modal = {
  Confirm,
  RepoCreate,
  RepoUnlock,
  ImageInsert,
  Info,
  InputConfirm,
}

export default Modal

