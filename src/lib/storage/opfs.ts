/** 反思附件的本地文件存储：Origin Private File System，纯本地读写，不联网。*/

const DIR_NAME = 'reflection-attachments'

export function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function attachmentsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIR_NAME, { create: true })
}

/** 写入一个附件文件，返回用于之后读取/删除的引用（文件名） */
export async function saveAttachment(file: File): Promise<string> {
  const dir = await attachmentsDir()
  const ref = `${crypto.randomUUID()}-${file.name}`
  const handle = await dir.getFileHandle(ref, { create: true })
  const writable = await handle.createWritable()
  await writable.write(file)
  await writable.close()
  return ref
}

/** 读出附件生成可显示的本地 object URL（调用方用完需自行 URL.revokeObjectURL） */
export async function getAttachmentURL(ref: string): Promise<string> {
  const dir = await attachmentsDir()
  const handle = await dir.getFileHandle(ref)
  const file = await handle.getFile()
  return URL.createObjectURL(file)
}

export async function deleteAttachment(ref: string): Promise<void> {
  const dir = await attachmentsDir()
  await dir.removeEntry(ref).catch(() => {})
}
