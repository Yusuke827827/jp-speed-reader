// 英語の辞書。画面ごとのファイルをまとめる

import common from './common'
import library from './library'
import importer from './import'
import ocr from './ocr'
import reader from './reader'
import pdfviewer from './pdfviewer'
import settings from './settings'
import history from './history'
import lib from './lib'
import help from './help'
import customize from './customize'
import notes from './notes'
import goals from './goals'
import speech from './speech'
import quiz from './quiz'
import epub from './epub'

const en: Record<string, string> = { ...common, ...library, ...importer, ...ocr, ...reader, ...pdfviewer, ...settings, ...history, ...lib, ...help, ...customize, ...notes, ...goals, ...speech, ...quiz, ...epub }

export default en
