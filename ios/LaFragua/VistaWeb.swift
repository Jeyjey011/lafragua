import SwiftUI
import WebKit

struct VistaWeb: UIViewRepresentable {

    func makeCoordinator() -> PuenteNativo { PuenteNativo() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(ServidorLocal(), forURLScheme: ServidorLocal.esquema)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Le decimos a la página, antes de que corra nada suyo, que aquí hay capa
        // nativa: es la misma señal que usa en Windows para encender el montaje.
        let aviso = WKUserScript(
            source: "window.__FRAGUA_IOS = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(aviso)
        config.userContentController.add(context.coordinator, name: "fragua")

        let web = WKWebView(frame: .zero, configuration: config)
        web.allowsBackForwardNavigationGestures = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.05, green: 0.043, blue: 0.039, alpha: 1) // #0d0b0a
        web.scrollView.backgroundColor = web.backgroundColor

        context.coordinator.web = web

        if let url = URL(string: "\(ServidorLocal.esquema)://app/index.html") {
            web.load(URLRequest(url: url))
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { }
}
