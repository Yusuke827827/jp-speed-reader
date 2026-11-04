// 英語の訳（キーは画面の日本語の文）: はじめの案内
const dict: Record<string, string> = {
  '小説を取り込む': 'Add a novel',
  'PDF・EPUB・テキストを選ぶと、本文を取り出して本棚に並べます。本はこの端末の中だけに保存し、外部には送りません。': 'Choose a PDF, EPUB or text file and its text is added to your library. Books are stored only on this device and never sent anywhere.',
  '画面の中央で読む': 'Read in the center of the screen',
  '文節ごとに画面の中央へ表示します。中央をタップすると再生と一時停止、下の「−」「＋」で速さを変えます。': 'Text appears phrase by phrase in the center. Tap the center to play or pause, and use “−” and “+” at the bottom to change the speed.',
  'ホーム画面に追加する': 'Add to Home Screen',
  'iPhoneでは、Safariの「共有」から「ホーム画面に追加」を選んでください。アプリのように開け、取り込んだ本も消えにくくなります。': 'On iPhone, choose “Add to Home Screen” from Safari’s Share menu. It opens like an app, and your books are less likely to be removed.',
  'はじめに': 'Welcome',
  'スキップ': 'Skip',
  '{i}枚目／{n}枚': 'Page {i} of {n}',
  'はじめる': 'Get started',
  'はじめの案内をもう一度見る': 'Show the welcome guide again',
  '欧文（英語など）は語数で速度を合わせます。': 'English and other Latin-script text is timed by word count.',
  '句読点の間を入れても、本全体の平均が設定の速度になるよう表示時間を割り振ります。': 'Even with pauses at punctuation, display times are adjusted so the book averages the set speed.',
  '「注視点を強調」は、前から約3分の1の文字に色を付けて中央に置きます。': '“Highlight focus point” colors the character about a third of the way in and centers it.',
  '「参考文献」「References」から付録の手前までを飛ばします。PDF表示では読めます。': 'Skips from “References” up to the appendix. You can still read it in the PDF view.',
  'iPhoneでは、ホーム画面に追加しないと、7日間使わなかったときにデータが消えることがあります。': 'On iPhone, data may be removed after 7 days without use unless the app is added to the Home Screen.',
}

export default dict
