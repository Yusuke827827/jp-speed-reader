// 英語の訳（キーは画面の日本語の文）
const dict: Record<string, string> = {
  '横書きの短編（テキストPDF）': 'Horizontal short story (text PDF)',
  '縦書きの短編（テキストPDF）': 'Vertical short story (text PDF)',
  '画像だけのPDF（OCRの確認用）': 'Image-only PDF (for testing OCR)',
  挿絵入りのPDF: 'PDF with illustrations',
  '青空文庫形式のテキスト（ルビ・人物名）': 'Aozora Bunko text (ruby and character names)',
  '取り込み中に問題が起きました。': 'Something went wrong while importing.',
  '{message}。別の PDF で試すか、ページを再読み込みしてください。': '{message}. Try a different PDF or reload the page.',
  'サンプルを読み込めませんでした。': 'Couldn\'t load the sample.',
  本棚へ戻る: 'Back to Library',
  本を追加: 'Add a book',
  ファイルを読み込んでいます: 'Reading the file',
  '本文を取り出しています（{done} / {total} ページ）': 'Extracting text ({done} / {total} pages)',
  '欠けた文字を補っています（{done} / {total} ページ）': 'Repairing missing characters ({done} / {total} pages)',
  端末に保存しています: 'Saving to this device',
  中止: 'Cancel',
  小説のPDFかテキストを選んでください: 'Choose a novel as a PDF or text file',
  'PCではここにドラッグ＆ドロップもできます。iPhoneでは「ファイル」アプリやiCloud Driveから選べます。':
    'On a computer you can also drag and drop it here. On iPhone, pick it from the Files app or iCloud Drive.',
  ファイルを選ぶ: 'Choose file',
  読み込みの流れ: 'How importing works',
  'PDFに含まれる文字を取り出し、柱（ページ上部の書名など）・ノンブル・ルビを除いて段落に組み立てます。':
    'Text embedded in the PDF is extracted and assembled into paragraphs, leaving out running heads (like the book title at the top of the page), page numbers, and ruby.',
  '文字が入っていないページ（スキャン画像）は、続けて日本語OCRにかけられます。':
    'Pages with no text (scanned images) can then be run through Japanese OCR.',
  'テキスト（.txt）は UTF-8 と Shift_JIS に対応します。青空文庫形式なら題名・著者・見出し・ルビを読み取ります。':
    'Text files (.txt) can be UTF-8 or Shift_JIS. For Aozora Bunko format, the title, author, headings, and ruby are recognized.',
  'PDFと本文はこの端末のブラウザ内にだけ保存されます。外部のサーバーには送りません。':
    'PDFs and their text are stored only in this device\'s browser. Nothing is sent to an external server.',
  サンプルで試す: 'Try a sample',
  'このアプリ用に書いた短い文章です。': 'Short pieces written for this app.',
  '保存容量: {used} 使用 / 上限の目安 {quota}': 'Storage: {used} used / approx. limit {quota}',
  '（自動削除されない設定）': ' (protected from automatic deletion)',
}

export default dict
