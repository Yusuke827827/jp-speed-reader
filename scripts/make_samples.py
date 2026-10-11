"""動作確認用のサンプル PDF を作る（本文はこのプロジェクト用に書いた文章）。

  python -I scripts/make_samples.py

public/samples/ に次の 3 つを出力する。
  sample-horizontal.pdf  横書き・柱とノンブル付き・ページをまたぐ段落あり
  sample-vertical.pdf    縦書き（1 文字ずつ配置）・ルビ付き
  sample-scanned.pdf     縦書き版を画像にしただけの PDF（テキストなし、OCR 用）
"""
import pathlib
import sys
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)
FONT = pathlib.Path("C:/Windows/Fonts/yumin.ttf")
if not FONT.exists():
    sys.exit("游明朝 (yumin.ttf) が見つかりません")

TITLE = "雨上がりの図書館"
PARAS = [
    "坂の上の図書館は、月曜日だけ休みになる。それを知らずに来たのは、今月に入って二度目だった。",
    "「今日も閉まってるよ」",
    "振り返ると、傘を畳みかけた少女が立っていた。近所の中学校の制服を着ていて、肩のあたりが少し濡れている。",
    "「知ってた？」と僕が聞くと、彼女は首を横に振った。「知らなかった。でも、雨が止むまでここにいようと思って」",
    "軒下は二人で並ぶとちょうどいい幅だった。屋根を叩く音が、少しずつ間遠になっていく。向かいの家の雨どいから、細い水の糸が途切れずに落ちていた。",
    "時計を見ると、午後３時４５分を少し過ぎていた。気温は12.5度。十月にしては肌寒い。",
    "「何を借りに来たの？」",
    "「星の本。前に借りたのを返して、続きを読みたかったんだ」",
    "彼女は鞄から薄い冊子を取り出した。表紙には手書きで、夜空の地図のようなものが描いてある。自分で作ったのだという。",
    "やがて雲の切れ間から、斜めの光が差し込んできた。濡れた石段が白く光り、坂の下の町並みがくっきりと浮かび上がる。",
    "「止んだね」",
    "それだけ言うと、彼女は傘を手に持ったまま、軽い足取りで坂を下りていった。僕はしばらくその場に立ったまま、閉じた扉の向こうに並んでいるはずの、まだ読んでいない本のことを考えていた。",
]


def wrap(text: str, n: int) -> list[str]:
    """n 文字ごとに折り返す（行頭禁則: 句読点・閉じ括弧を前の行へ追い込む）"""
    lines, cur = [], ""
    for ch in text:
        if len(cur) >= n and ch not in "、。」』）":
            lines.append(cur)
            cur = ""
        cur += ch
    if cur:
        lines.append(cur)
    return lines


def horizontal():
    doc = pymupdf.open()
    font = pymupdf.Font(fontfile=str(FONT))
    W, H, size, lead, cols = 420, 595, 12, 21, 28
    lines = []
    for p in PARAS:
        body = p if p.startswith("「") else "　" + p
        lines += wrap(body, cols)
    per_page = 18
    pages = [lines[i:i + per_page] for i in range(0, len(lines), per_page)]
    for no, chunk in enumerate(pages, 1):
        page = doc.new_page(width=W, height=H)
        tw = pymupdf.TextWriter(page.rect)
        tw.append((50, 40), TITLE, font=font, fontsize=8)  # 柱
        y = 80
        for line in chunk:
            tw.append((42, y), line, font=font, fontsize=size)
            y += lead
        tw.append((W / 2 - 4, H - 30), str(no), font=font, fontsize=9)  # ノンブル
        tw.write_text(page)
    doc.set_metadata({"title": TITLE + "（横書き）"})
    doc.subset_fonts()
    doc.save(OUT / "sample-horizontal.pdf")


def vertical():
    doc = pymupdf.open()
    font = pymupdf.Font(fontfile=str(FONT))
    W, H, size, colgap, rows = 420, 595, 14, 26, 30
    cols = []
    ruby = {"図書館": "としょかん"}
    for p in PARAS:
        body = p if p.startswith("「") else "　" + p
        cols += wrap(body, rows)
    per_page = 13
    pages = [cols[i:i + per_page] for i in range(0, len(cols), per_page)]
    for no, chunk in enumerate(pages, 1):
        page = doc.new_page(width=W, height=H)
        tw = pymupdf.TextWriter(page.rect)
        # 柱は横書きの小さな文字で上部に置く
        tw.append((W - 150, 30), TITLE, font=font, fontsize=8)
        x = W - 50
        for col in chunk:
            y = 60
            for ch in col:
                # 句読点は升目の右上に寄せる
                dx, dy = (size * 0.55, -size * 0.55) if ch in "、。" else (0, 0)
                tw.append((x + dx, y + size + dy), ch, font=font, fontsize=size)
                y += size + 1
            # ルビ: 該当語の右横に小さな文字を置く
            for word, kana in ruby.items():
                i = col.find(word)
                if i >= 0:
                    ry = 60 + i * (size + 1)
                    step = (len(word) * (size + 1)) / len(kana)
                    for k, c in enumerate(kana):
                        tw.append((x + size + 1, ry + (k + 1) * step - 1), c, font=font, fontsize=6)
            x -= colgap
        tw.append((30, H - 24), str(no), font=font, fontsize=9)
        tw.write_text(page)
    doc.set_metadata({"title": TITLE + "（縦書き）"})
    doc.subset_fonts()
    doc.save(OUT / "sample-vertical.pdf")


def scanned():
    src = pymupdf.open(OUT / "sample-vertical.pdf")
    doc = pymupdf.open()
    for p in src:
        pix = p.get_pixmap(dpi=200, alpha=False)
        page = doc.new_page(width=p.rect.width, height=p.rect.height)
        page.insert_image(page.rect, pixmap=pix)
    doc.set_metadata({"title": TITLE + "（画像）"})
    doc.save(OUT / "sample-scanned.pdf", deflate=True)


horizontal()
vertical()
scanned()
for f in sorted(OUT.glob("*.pdf")):
    d = pymupdf.open(f)
    print(f.name, d.page_count, "pages", f.stat().st_size // 1024, "KB")


# 青空文庫形式のテキスト（Shift_JIS）。ルビ・見出し・人物名の確認用。本文はこのプロジェクト用に書いた文章
AOZORA = """川沿いの約束
試作文庫

-------------------------------------------------------
【テキスト中に現れる記号について】

《》：ルビ
（例）｜千晴《ちはる》

｜：ルビの付く文字列の始まりを特定する記号

［＃］：入力者注　主に外字の説明や、傍点の位置の指定
-------------------------------------------------------

［＃５字下げ］一［＃「一」は中見出し］

　｜千晴《ちはる》は、朝いちばんの電車で｜湊《みなと》の住む町に着いた。改札を出ると、川の匂いがした。
「おはよう。思ったより早かったね」
　湊は自転車を押しながら、少し眠そうな顔で手を振った。千晴は小さく笑って、肩にかけた鞄を持ち直した。
　二人は川沿いの道を歩いた。｜堤防《ていぼう》の上には、まだ誰もいない。遠くで鉄橋を渡る電車の音が、ゆっくりと近づいては離れていった。

［＃５字下げ］二［＃「二」は中見出し］

　昼を過ぎると、空の色が少しずつ白くなった。湊は古い地図を広げ、指で｜渡《わた》し｜場《ば》の跡をたどった。
「ここに橋ができる前は、舟で向こう岸へ渡っていたんだって」
　千晴は地図をのぞきこみ、湊の指の先を目で追った。紙の端は日に焼けて、ところどころ破れている。
「じゃあ、帰りはそこまで歩いてみようか」
　湊がうなずくと、川面を渡る風が、二人のあいだを静かに通り抜けていった。



底本：「試作文庫」このアプリの動作確認用
※この文章は動作確認のために書き下ろしたものです。
"""


def aozora():
    (OUT / "sample-aozora.txt").write_bytes(AOZORA.replace("\n", "\r\n").encode("shift_jis"))


aozora()
print("sample-aozora.txt", (OUT / "sample-aozora.txt").stat().st_size, "bytes")


def scene_pixmap(width, height):
    """図形だけで描いたオリジナルの風景（月・山・川・橋）を画像にする"""
    tmp = pymupdf.open()
    pg = tmp.new_page(width=width, height=height)
    W, H = width, height
    pg.draw_rect(pg.rect, color=None, fill=(0.16, 0.2, 0.33))  # 夜空
    pg.draw_circle((W * 0.75, H * 0.22), W * 0.08, color=None, fill=(0.98, 0.93, 0.7))  # 月
    hills = [(0, H * 0.62), (W * 0.25, H * 0.45), (W * 0.5, H * 0.58), (W * 0.78, H * 0.42), (W, H * 0.6), (W, H), (0, H)]
    pg.draw_polyline(hills, color=None, fill=(0.2, 0.3, 0.25), closePath=True)  # 山
    river = [(W * 0.35, H), (W * 0.48, H * 0.7), (W * 0.55, H * 0.62), (W * 0.62, H * 0.7), (W * 0.8, H)]
    pg.draw_polyline(river, color=None, fill=(0.45, 0.6, 0.78), closePath=True)  # 川
    pg.draw_line((W * 0.38, H * 0.8), (W * 0.76, H * 0.8), color=(0.55, 0.35, 0.2), width=W * 0.015)  # 橋
    for k in range(5):
        x = W * (0.41 + k * 0.08)
        pg.draw_line((x, H * 0.8), (x, H * 0.88), color=(0.55, 0.35, 0.2), width=W * 0.008)
    return pg.get_pixmap(dpi=110, alpha=False)


def illustrated():
    """本文・挿絵だけのページ・挿絵入りのページを含む PDF"""
    doc = pymupdf.open()
    font = pymupdf.Font(fontfile=str(FONT))
    W, H, size, lead, cols = 420, 595, 12, 21, 28
    lines = []
    for p in PARAS:
        body = p if p.startswith("「") else "　" + p
        lines += wrap(body, cols)

    def text_page(chunk, y=80):
        page = doc.new_page(width=W, height=H)
        tw = pymupdf.TextWriter(page.rect)
        for line in chunk:
            tw.append((42, y), line, font=font, fontsize=size)
            y += lead
        tw.write_text(page)
        return page

    # 1 ページ目は段落の途中で終わり、挿絵ページをはさんで 3 ページ目に続く
    text_page(lines[0:9])
    full = doc.new_page(width=W, height=H)
    full.insert_image(pymupdf.Rect(30, 60, W - 30, H - 60), pixmap=scene_pixmap(360, 475))
    mixed = text_page(lines[9:17], y=260)
    mixed.insert_image(pymupdf.Rect(60, 40, W - 60, 230), pixmap=scene_pixmap(300, 190))
    text_page(lines[17:])
    doc.set_metadata({"title": TITLE + "（挿絵入り）"})
    doc.subset_fonts()
    doc.save(OUT / "sample-illustrated.pdf", deflate=True)


illustrated()
print("sample-illustrated.pdf", (OUT / "sample-illustrated.pdf").stat().st_size // 1024, "KB")
