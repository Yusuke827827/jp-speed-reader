// 英語の訳（キーは画面の日本語の文）
const dict: Record<string, string> = {
  // segment.ts: CHUNK_MODES
  '1文字': '1 char',
  '1文字ずつ（句読点は前の文字と一緒）': 'One character at a time (punctuation stays with the previous character)',
  '2〜4文字': '2–4 chars',
  '文節を4文字以内に収める': 'Phrases trimmed to 4 characters or fewer',
  '文節': 'Phrase',
  'BudouXの文節単位': 'Phrases as split by BudouX',
  'フレーズ': 'Long phrase',
  '短い文節をつないで目標の長さに': 'Joins short phrases up to the target length',
  '文': 'Sentence',
  '1文ずつ（長い文は読点で分ける）': 'One sentence at a time (long sentences split at commas)',

  // timing.ts: SPEED_PRESETS / WPM_PRESETS
  'ゆっくり': 'Slow',
  '標準': 'Normal',
  '速い': 'Fast',
  '高速': 'Very fast',

  // settings.ts: THEMES
  '紙': 'Paper',
  '和紙': 'Washi',
  '羊皮紙': 'Parchment',
  '夜空': 'Night sky',
  'オーロラ': 'Aurora',
  '白': 'White',
  'セピア': 'Sepia',
  'グレー': 'Gray',
  '黒': 'Dark',
  '真っ黒': 'Black',

  // db.ts
  '端末の保存容量が足りません。読み終えた本を本棚から削除するか、ストレージの空きを増やしてから、もう一度試してください。':
    'Not enough storage on this device. Remove finished books from your Library or free up storage, then try again.',
  'ブラウザの保存領域にアクセスできませんでした。プライベートブラウズを使っている場合は通常モードで開いてください。':
    "Couldn't access the browser's storage. If you're using private browsing, open the app in a normal window.",
  '保存に失敗しました（{name}）。ページを再読み込みしてから、もう一度試してください。':
    "Couldn't save ({name}). Reload the page and try again.",
  '不明なエラー': 'unknown error',

  // importer.ts
  '対応していないファイルです。': 'This file type isn’t supported.',
  '小説の PDF（.pdf）か、テキストファイル（.txt、青空文庫形式も可）を選んでください。':
    'Choose a PDF (.pdf) or a text file (.txt, Aozora Bunko format supported).',
  'ファイルを読み込めませんでした。': "Couldn't read the file.",
  'iCloud Drive のファイルは、先に「ファイル」アプリでダウンロードしてから選んでください。':
    'For files in iCloud Drive, download them in the Files app first, then choose them.',
  '別の PDF で試すか、元のアプリから PDF を書き出し直してください。':
    'Try another PDF, or export the PDF again from the original app.',
  'このブラウザでは本文を取り出せませんでした。': "Couldn't extract the text in this browser.",
  'ブラウザを最新版に更新してから、もう一度試してください。直らない場合は、別のブラウザで開いてください。':
    "Update your browser to the latest version and try again. If that doesn't help, try a different browser.",
  '本文が見つかりませんでした。': 'No text found.',
  '空のファイルか、文字コードが UTF-8・Shift_JIS 以外の可能性があります。':
    'The file may be empty, or its encoding may be something other than UTF-8 or Shift_JIS.',
  '文字化けしているようです。': 'The text appears to be garbled.',
  'UTF-8 か Shift_JIS で保存し直したテキストを選んでください。': 'Save the text again as UTF-8 or Shift_JIS and choose it.',

  // pdf.ts
  'パスワードで保護された PDF は読み込めません。保護を外した PDF を用意してください。':
    "Password-protected PDFs can't be opened. Please use a PDF without protection.",
  'PDF が壊れているか、PDF 形式ではありません。別の方法で保存し直した PDF を試してください。':
    'The PDF is damaged or not a PDF file. Try a PDF saved again another way.',
  'PDF を開けませんでした（{detail}）。': "Couldn't open the PDF ({detail}).",

  // ocr.ts
  '元の PDF が見つかりません。本棚から取り込み直してください。': "The original PDF wasn't found. Import it again from your Library.",
  'ページを画像にしています': 'Rendering page as image',
  '縦書きか横書きかを判定しています（初回は学習データを取得します）':
    'Detecting vertical or horizontal text (downloads language data the first time)',
  '英語の文書として読み直しています': 'Re-reading as an English document',
  '保存しました': 'Saved',
  '学習データを読み込んでいます': 'Loading language data',
  'OCR エンジンを読み込んでいます': 'Loading OCR engine',
  'OCR エンジンを準備しています': 'Preparing OCR engine',
  '文字を認識しています': 'Recognizing text',

  // useBook.ts
  'この本は見つかりませんでした。本棚から削除された可能性があります。':
    "This book wasn't found. It may have been removed from your Library.",

  // people.ts: 人物の候補の理由
  'ルビ付き': 'Has ruby',
  '「{honorific}」付き': 'With “{honorific}”',
  'カタカナ': 'Katakana',
}

export default dict
