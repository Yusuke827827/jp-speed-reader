// 英語の訳（キーは画面の日本語の文）: 設定画面の「使い方」
const dict: Record<string, string> = {
  '使い方': 'How to use',
  '本を追加する': 'Adding a book',
  '本棚の「PDFを追加」から、小説のPDFかテキスト（.txt）を選びます。青空文庫のテキストなら、題名・目次・ルビも読み取ります。':
    'Tap “Add PDF” on the library and choose a novel PDF or a text file (.txt). For Aozora Bunko text, the title, contents and ruby are read too.',
  'iPhoneでは「ファイル」アプリやiCloud Driveから選べます。PCではドラッグ＆ドロップもできます。':
    'On iPhone you can pick from the Files app or iCloud Drive. On a computer you can also drag and drop.',
  '文字の入っていない画像だけのPDFは、取り込んだあとに文字認識（OCR）へ進みます。':
    'A PDF made only of images, with no text, goes on to text recognition (OCR) after importing.',
  'まず試すなら、取り込み画面の「サンプルで試す」が手軽です。': 'To try it out first, use “Try a sample” on the import screen.',
  '高速読書の基本': 'Speed reading basics',
  '画面の中央をタップするか、再生ボタンを押すと始まります。もう一度タップすると止まります。':
    'Tap the middle of the screen or press the play button to start. Tap again to pause.',
  '「‹ ›」で1単位、「« »」で1段落ずつ前後に移動できます。': 'Use ‹ › to move one unit and « » to move one paragraph back or forward.',
  '下の「−」「＋」で速度を変えます。速度の数字を押すと、細かい設定が開きます。':
    'Change the speed with − and + at the bottom. Tap the speed number to open more settings.',
  '止まっているあいだは本文の一覧が出ます。読みたい所をタップすると、そこから読めます。':
    'While paused, the text is shown below. Tap any part to continue reading from there.',
  '読んだ位置は自動で保存され、次に開くと続きから読めます。': 'Your place is saved automatically, so the book opens where you left off.',
  '読みやすく調整する': 'Making it easier to read',
  '読書画面の右上の歯車から、分割の単位（文節・フレーズなど）、最小の字数、文字サイズ、配色、縦・横を変えられます。':
    'From the gear at the top right of the reading screen, you can change the unit (phrase and so on), the minimum length, the text size, the colors, and vertical or horizontal display.',
  '速く感じたら速度を下げるか、分割の単位を「フレーズ」にして1回に表示する量を増やしてみてください。':
    'If it feels too fast, lower the speed, or choose “Phrase” as the unit to show more text at a time.',
  '句読点や段落の終わりでは少し長めに止まります。この「間」は設定でなくすこともできます。':
    'The display pauses a little longer at punctuation and at the end of a paragraph. You can turn these pauses off in the settings.',
  '人物の色分けとルビ': 'Character colors and ruby',
  '読書画面の人のアイコンから登場人物を登録すると、名前が色分けされ、説明が名前の下に出ます。':
    'Register characters from the person icon on the reading screen. Their names are shown in color, with a short note below the name.',
  '候補の一覧から選ぶと、すぐに登録できます。候補には人名でない語も混ざります。':
    'Pick from the list of suggestions to register a name quickly. The suggestions can include words that are not names.',
  'ルビ（ふりがな）は、漢字の上に小さく表示されます。': 'Ruby (reading aids) is shown in small letters above the kanji.',
  '挿絵': 'Illustrations',
  '挿絵の位置に来ると、絵を表示して止まります。タップすると続きから読めます。':
    'When you reach an illustration, it is shown and reading pauses. Tap to continue.',
  '止まる・数秒だけ表示・飛ばすは、読書設定の「挿絵の位置に来たら」で選べます。':
    'Choose to pause, show it for a few seconds, or skip it under “At an illustration” in the reading settings.',
  '挿絵の判定が違うページは、PDF表示の画面の「挿絵にする」で切り替えられます。':
    'If a page is wrongly treated as an illustration (or not), switch it with “Mark as illustration” on the PDF view.',
  '元のPDFを見る・本文を直す': 'Viewing the original PDF and fixing the text',
  '読書画面のPDFのアイコンで、元のページを表示できます。「速読」を押すと、そのページから高速読書に戻ります。':
    'The PDF icon on the reading screen shows the original page. Press “Speed read” to go back to speed reading from that page.',
  'PDF表示の「比較」で、元のページと取り出した本文を並べて見比べ、本文を直せます。':
    'Use “Compare” on the PDF view to see the original page next to the extracted text, and correct the text.',
  '目次・ページ一覧・本文検索・しおりも、PDF表示の画面の上のボタンから使えます。':
    'Contents, page thumbnails, text search and bookmarks are available from the buttons at the top of the PDF view.',
  'iPhoneで使うときのコツ': 'Tips for iPhone',
  'Safariで開き、「共有」から「ホーム画面に追加」を選ぶと、アプリのように起動でき、オフラインでも読めます。':
    'Open it in Safari and choose “Add to Home Screen” from the Share menu. It then starts like an app and works offline.',
  'ホーム画面に追加しないと、7日間開かなかったときに、取り込んだ本が消えることがあります。':
    'If you do not add it to the Home Screen, imported books may be removed after seven days without opening the app.',
  'アプリを新しくしたあとは、本を取り込み直すと、改良された読み取りが使われます。':
    'After the app is updated, import a book again to use the improved text reading.',
  '本や読書の記録はこの端末の中にだけ保存され、外部には送られません。':
    'Books and reading records are saved only on this device and are never sent anywhere.',
}

export default dict
