// 英語の訳（キーは画面の日本語の文）: EPUB の取り込み
const dict: Record<string, string> = {
  '小説の PDF（.pdf）、EPUB（.epub）、テキストファイル（.txt、青空文庫形式も可）のどれかを選んでください。': 'Choose a novel as a PDF (.pdf), EPUB (.epub) or text file (.txt, Aozora Bunko format supported).',
  'コピー防止（DRM）のかかったEPUBは読めません。': 'EPUBs with copy protection (DRM) cannot be read.',
  'DRMの無いEPUB（青空文庫のEPUBや、DRMフリーで販売・配布されている本）を選んでください。': 'Choose a DRM-free EPUB, such as an Aozora Bunko EPUB or a book sold or shared without DRM.',
  '画像だけでできたEPUB（漫画など）には対応していません。': 'EPUBs made only of images (such as comics) are not supported.',
  'EPUBとして読み込めませんでした。': 'Could not read this as an EPUB.',
  'ファイルが壊れているか、EPUBではない可能性があります。': 'The file may be damaged or may not be an EPUB.',
  '別の EPUB で試してください。': 'Try a different EPUB.',
  '元の EPUB が見つかりません': 'The original EPUB was not found',
  '小説のPDF・EPUB・テキストを選んでください': 'Choose a novel: PDF, EPUB or text',
  'EPUB（.epub）は、本文・ルビ・目次・挿絵を読み取ります。コピー防止（DRM）のかかった本は読めません。': 'For EPUB (.epub), the text, ruby, table of contents and illustrations are read. Books with copy protection (DRM) cannot be read.',
  'EPUB（.epub）も取り込めます。コピー防止（DRM）のかかった本は読めません。': 'You can also add EPUB (.epub) files. Books with copy protection (DRM) cannot be read.',
}

export default dict
