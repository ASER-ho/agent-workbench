export interface IpcFrameLike {
  parent: unknown | null
  url: string
}

export interface IpcSenderLike {
  isDestroyed(): boolean
  getURL(): string
}

export interface IpcEventLike {
  sender: IpcSenderLike
  senderFrame: IpcFrameLike | null
}

export interface IpcWindowLike {
  isDestroyed(): boolean
  webContents: IpcSenderLike
}

export function isTrustedIpcSender(event: IpcEventLike, window: IpcWindowLike): boolean {
  if (window.isDestroyed() || event.sender.isDestroyed() || !event.senderFrame) {
    return false
  }

  return (
    event.sender === window.webContents &&
    event.senderFrame.parent === null &&
    event.senderFrame.url === window.webContents.getURL()
  )
}
