import WebKit

/// Sirve el HTML desde dentro de la app bajo un origen fijo, `fragua://app/`.
///
/// El motivo no es capricho: si se carga con `file://`, WebKit da a la página un
/// origen opaco y `localStorage` no sobrevive entre arranques — es decir, se
/// perderian las llaves, los productos y los proyectos cada vez que se cierra la
/// app. Es el mismo problema que en Windows se resolvió con `fragua.local`.
final class ServidorLocal: NSObject, WKURLSchemeHandler {

    static let esquema = "fragua"

    private let tipos: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js":   "text/javascript; charset=utf-8",
        "css":  "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "svg":  "image/svg+xml"
    ]

    func webView(_ webView: WKWebView, start tarea: WKURLSchemeTask) {
        guard let url = tarea.request.url else {
            tarea.didFailWithError(URLError(.badURL)); return
        }

        var ruta = url.path
        if ruta.isEmpty || ruta == "/" { ruta = "/index.html" }
        let nombre = (ruta as NSString).lastPathComponent
        let base = (nombre as NSString).deletingPathExtension
        let ext  = (nombre as NSString).pathExtension

        guard let archivo = Bundle.main.url(forResource: base, withExtension: ext),
              let datos = try? Data(contentsOf: archivo) else {
            tarea.didFailWithError(URLError(.fileDoesNotExist)); return
        }

        let respuesta = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": tipos[ext.lowercased()] ?? "application/octet-stream",
                "Content-Length": String(datos.count),
                "Access-Control-Allow-Origin": "*"
            ]
        )!

        tarea.didReceive(respuesta)
        tarea.didReceive(datos)
        tarea.didFinish()
    }

    func webView(_ webView: WKWebView, stop tarea: WKURLSchemeTask) { }
}
