// 縦書きでの単位の表示。1 文字ずつ上から下へ並べ、入りきらなければ右から左へ列を増やす。

import SwiftUI
import FlowaKit

struct VerticalChunk: View {
    let text: String
    let size: Double
    /// 大きさを指定して字体を返す
    let font: (Double) -> Font

    var body: some View {
        GeometryReader { geo in
            let cells = VerticalForms.cells(text)
            let layout = fit(cells.count, in: geo.size)
            let columns = stride(from: 0, to: cells.count, by: layout.perColumn).map { Array(cells[$0..<min($0 + layout.perColumn, cells.count)]) }
            // 右の列から読むので、最初の列を右端に置く
            HStack(alignment: .top, spacing: layout.size * 0.35) {
                ForEach(Array(columns.enumerated().reversed()), id: \.offset) { _, column in
                    VStack(spacing: 0) {
                        ForEach(Array(column.enumerated()), id: \.offset) { _, cell in
                            Text(cell.text)
                                .font(font(layout.size))
                                .rotationEffect(cell.rotated ? .degrees(90) : .zero)
                                .frame(width: layout.size * 1.1, height: layout.size * (cell.narrow ? 0.62 : 1.04))
                        }
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    /// 文字の大きさと 1 列の字数。列が多くなりすぎるときは文字を小さくする
    private func fit(_ count: Int, in box: CGSize) -> (size: Double, perColumn: Int) {
        var s = size
        while true {
            let per = max(1, Int(box.height * 0.92 / (s * 1.04)))
            let cols = (count + per - 1) / per
            if Double(cols) * s * 1.45 <= box.width * 0.92 || s <= 14 { return (s, per) }
            s *= 0.9
        }
    }
}
