// Flowa Pro（買い切り・非消耗型）の購入と、購入済みかどうか。StoreKit 2 を使う。
// 商品 ID は App Store Connect に登録するものと同じにする。手元では ios/FlowaApp/Flowa.storekit で試せる。

import Foundation
import Observation
#if canImport(StoreKit)
import StoreKit
#endif

@Observable
@MainActor
public final class ProStore {
    public static let productID = "app.flowa.reader.pro"

    /// 購入や復元の結果（画面で文言にする）
    public enum Outcome: Equatable, Sendable {
        case purchased, pending, cancelled, nothingToRestore, unavailable, failed
    }

    /// Pro を使えるか。起動直後は前回の結果を使い、App Store に確かめたら置き換える
    public private(set) var isPro: Bool
    /// 値段の表示（App Store から商品を読めたとき。例: ¥1,200）
    public private(set) var price: String?
    /// 購入・復元の途中
    public private(set) var busy = false

    private let defaults: UserDefaults
    /// 画面写真の撮影など、購入なしで Pro として動かすとき
    private let forcePro: Bool
    private static let cacheKey = "flowa.isPro"
    #if canImport(StoreKit)
    private var product: Product?
    private var updates: Task<Void, Never>?
    #endif

    public init(defaults: UserDefaults = .standard, forcePro: Bool = false) {
        self.defaults = defaults
        self.forcePro = forcePro
        isPro = forcePro || defaults.bool(forKey: Self.cacheKey)
    }

    /// 起動時に 1 回呼ぶ。購入済みかを確かめ、別の端末での購入や返金を待ち受け、値段を読む
    public func start() async {
        #if canImport(StoreKit)
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case let .verified(t) = result { await t.finish() }
                await self?.refresh()
            }
        }
        await refresh()
        await loadProduct()
        #endif
    }

    /// 購入済みかを App Store の記録から確かめる
    public func refresh() async {
        #if canImport(StoreKit)
        var owned = false
        for await result in Transaction.currentEntitlements {
            if case let .verified(t) = result, t.productID == Self.productID, t.revocationDate == nil { owned = true }
        }
        set(owned)
        #endif
    }

    public func purchase() async -> Outcome {
        #if canImport(StoreKit)
        if product == nil { await loadProduct() }
        guard let product else { return .unavailable }
        busy = true
        defer { busy = false }
        do {
            switch try await product.purchase() {
            case let .success(result):
                guard case let .verified(t) = result else { return .failed }
                await t.finish()
                await refresh()
                return isPro ? .purchased : .failed
            case .pending:
                return .pending
            case .userCancelled:
                return .cancelled
            @unknown default:
                return .failed
            }
        } catch {
            return .failed
        }
        #else
        return .unavailable
        #endif
    }

    /// 購入の復元（機種変更や再インストールのあと）
    public func restore() async -> Outcome {
        #if canImport(StoreKit)
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            return .failed
        }
        await refresh()
        return isPro ? .purchased : .nothingToRestore
        #else
        return .unavailable
        #endif
    }

    #if canImport(StoreKit)
    private func loadProduct() async {
        product = try? await Product.products(for: [Self.productID]).first
        price = product?.displayPrice
    }
    #endif

    private func set(_ owned: Bool) {
        isPro = forcePro || owned
        defaults.set(owned, forKey: Self.cacheKey)
    }
}
