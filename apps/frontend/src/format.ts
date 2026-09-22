/** Shared by UploaderView (pre-upload `File`s) and DownloaderView (server-returned file metadata)
 * so both sides of a transfer render sizes/icons identically. */

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const fileIconFor = (filename: string, contentType: string): string => {
  if (contentType.startsWith('image/')) return 'mdi-file-image-outline'
  if (contentType === 'application/pdf') return 'mdi-file-pdf-box'
  if (filename.endsWith('.zip')) return 'mdi-folder-zip-outline'
  return 'mdi-file-outline'
}
