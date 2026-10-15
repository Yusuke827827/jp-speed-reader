// 英語の訳（キーは画面の日本語の文）
const dict: Record<string, string> = {
  '「{title}」を削除しました': 'Deleted "{title}"',
  '削除できませんでした: {message}': 'Couldn\'t delete: {message}',
  読書履歴: 'Reading history',
  設定: 'Settings',
  PDFを追加: 'Add PDF',
  本棚を読み込めませんでした: 'Couldn\'t load your library',
  'プライベートブラウズでは保存が使えません。通常のタブで開き直してください。':
    'Storage isn\'t available in private browsing. Please reopen this page in a regular tab.',
  前回の続き: 'Continue where you left off',
  '・p.{page}': ' · p.{page}',
  続きから読む: 'Continue reading',
  '読み込み中…': 'Loading…',
  本棚は空です: 'Your library is empty',
  '日本語の小説PDFやテキスト（青空文庫形式も可）を追加すると、画面中央に短い単位で表示して読めます。':
    'Add a Japanese novel as a PDF or text file (Aozora Bunko format works too) to read it in short chunks shown in the center of the screen.',
  '{title}を開く': 'Open {title}',
  OCRエラー: 'OCR error',
  OCR未完了: 'OCR incomplete',
  '読了率 {pct}%': 'Progress {pct}%',
  '{author}・': '{author} · ',
  '・p.{page}/{total}': ' · p.{page}/{total}',
  '・{n}ページ': ' · {n} pages',
  '{date}・計{duration}': '{date} · {duration} total',
  未読: 'Unread',
  続きから: 'Continue',
  読む: 'Read',
  その他の操作: 'More actions',
  PDF表示: 'View PDF',
  削除: 'Delete',
  '本棚から削除しますか？': 'Delete from library?',
  '「{title}」のPDF・抽出した本文・読書位置・しおり・履歴をこの端末から削除します。元に戻せません。':
    'This removes the PDF, extracted text, reading position, bookmarks, and history for "{title}" from this device. This can\'t be undone.',
  削除する: 'Delete',
}

export default dict
