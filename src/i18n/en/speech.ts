// 英語の訳（キーは画面の日本語の文）: 読み上げとの同時表示
const dict: Record<string, string> = {
  '読み上げできませんでした（{error}）': 'Speech failed ({error})',
  '読み上げ ×{rate}': 'Speech ×{rate}',
  'このブラウザは読み上げに対応していません。': 'This browser does not support speech.',
  '読み上げに合わせて表示する': 'Show words in sync with speech',
  '読み上げの速さ': 'Speech rate',
  '声': 'Voice',
  '自動': 'Auto',
  '読み上げ中は、表示の速さ（字/分）ではなく声の速さで進みます。声によっては表示が少し遅れます。': 'While speaking, words advance at the voice’s pace instead of the reading speed. With some voices the display may lag slightly.',
  'タイマーで読み上げを止めました': 'Sleep timer stopped the speech',
  '・あと{n}分で停止': ' · stops in {n} min',
  'スリープタイマー': 'Sleep timer',
  '{n}分': '{n} min',
  'スリープタイマーは、再生を始めてから数えます。': 'The sleep timer counts from when you press play.',
  '栞・メモ・目標・読み上げ': 'Marks, notes, goals and speech',
  '読書画面の栞のアイコンで、今の文に蛍光マーカーやメモを付けられます。印には番号が付き、番号を入れるとその文へ移動できます。': 'Use the bookmark icon on the reading screen to highlight the current sentence or add a note. Each mark gets a number, and entering the number jumps to that sentence.',
  '読書履歴の画面で1日の目標（時間か字数）を決めると、達成した日と連続日数が記録されます。': 'Set a daily goal (time or characters) on the History screen to track the days you reach it and your streak.',
  '読書設定の「読み上げに合わせて表示する」をオンにすると、端末の音声で読み上げながら、読んでいる所を表示します。速さと声も選べます。': 'Turn on “Show words in sync with speech” in the reading settings to hear the text read aloud by your device while the current words are shown. You can choose the rate and voice.',
}

export default dict
