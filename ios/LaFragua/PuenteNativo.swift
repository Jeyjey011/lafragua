import UIKit
import WebKit
import Photos
import PhotosUI
import UniformTypeIdentifiers
import UserNotifications

/// El puente entre la página y el teléfono.
///
/// Es lo que hace que esto sea una app y no una web metida en una ventana: guardar
/// en el carrete, compartir, tomar una foto del producto, avisar cuando termina un
/// video que tarda minutos, y leer o escribir archivos en la app Archivos.
final class PuenteNativo: NSObject, WKScriptMessageHandler {

    weak var web: WKWebView?

    private var pendienteFoto: String?
    private var pendienteArchivo: String?

    // MARK: - Entrada desde la página

    func userContentController(_ ucc: WKUserContentController, didReceive mensaje: WKScriptMessage) {
        guard let cuerpo = mensaje.body as? [String: Any],
              let id = cuerpo["id"] as? String,
              let op = cuerpo["op"] as? String else { return }
        let datos = cuerpo["datos"] as? [String: Any] ?? [:]

        Task { @MainActor in
            do {
                // Las operaciones que abren un selector responden solas desde su
                // delegado, cuando el usuario termina: devuelven nil aquí.
                if let resultado = try await self.ejecutar(op: op, datos: datos, id: id) {
                    self.responder(id: id, ok: true, resultado: resultado, error: nil)
                }
            } catch {
                self.responder(id: id, ok: false, resultado: nil, error: error.localizedDescription)
            }
        }
    }

    @MainActor
    private func ejecutar(op: String, datos: [String: Any], id: String) async throws -> [String: Any]? {
        switch op {

        case "guardarEnFotos":
            guard let s = datos["url"] as? String, let url = URL(string: s) else {
                throw Fallo.mensaje("No vino la dirección del archivo.")
            }
            try await guardarEnFotos(url)
            return ["guardado": true]

        case "compartir":
            guard let s = datos["url"] as? String, let url = URL(string: s) else {
                throw Fallo.mensaje("No vino la dirección del archivo.")
            }
            let local = try await descargar(url)
            compartir(elementos: [local])
            return ["compartido": true]

        case "compartirTexto":
            compartir(elementos: [datos["texto"] as? String ?? ""])
            return ["compartido": true]

        case "guardarArchivo":
            try guardarArchivo(nombre: datos["nombre"] as? String ?? "la-fragua.json",
                               texto: datos["texto"] as? String ?? "")
            return ["guardado": true]

        case "abrirArchivo":
            pendienteArchivo = id
            abrirSelectorDeArchivo()
            return nil

        case "elegirFoto":
            pendienteFoto = id
            abrirSelectorDeFotos()
            return nil

        case "avisar":
            await avisar(titulo: datos["titulo"] as? String ?? "LA FRAGUA",
                         cuerpo: datos["cuerpo"] as? String ?? "")
            return ["avisado": true]

        case "info":
            return ["plataforma": "ios",
                    "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?",
                    "montajeDisponible": false]

        default:
            throw Fallo.mensaje("Operación desconocida: \(op)")
        }
    }

    private func responder(id: String, ok: Bool, resultado: [String: Any]?, error: String?) {
        var carga: [String: Any] = ["id": id, "ok": ok]
        if let resultado { carga["resultado"] = resultado }
        if let error { carga["error"] = error }
        guard let json = try? JSONSerialization.data(withJSONObject: carga),
              let texto = String(data: json, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            self.web?.evaluateJavaScript("window.__fraguaRespuesta && window.__fraguaRespuesta(\(texto));")
        }
    }

    enum Fallo: LocalizedError {
        case mensaje(String)
        var errorDescription: String? {
            if case .mensaje(let m) = self { return m }
            return nil
        }
    }

    // MARK: - Carrete

    private func descargar(_ url: URL) async throws -> URL {
        if url.isFileURL { return url }
        let (datos, respuesta) = try await URLSession.shared.data(from: url)
        if let http = respuesta as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw Fallo.mensaje("El archivo respondió \(http.statusCode).")
        }
        var ext = url.pathExtension
        if ext.isEmpty {
            ext = (respuesta.mimeType?.contains("video") ?? false) ? "mp4" : "jpg"
        }
        let destino = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)
        try datos.write(to: destino)
        return destino
    }

    private func guardarEnFotos(_ url: URL) async throws {
        let permiso = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard permiso == .authorized || permiso == .limited else {
            throw Fallo.mensaje("Hace falta permiso para guardar en Fotos. Actívalo en Ajustes → LA FRAGUA.")
        }
        let local = try await descargar(url)
        let esVideo = ["mp4", "mov", "m4v"].contains(local.pathExtension.lowercased())
        try await PHPhotoLibrary.shared().performChanges {
            let peticion = PHAssetCreationRequest.forAsset()
            peticion.addResource(with: esVideo ? .video : .photo, fileURL: local, options: nil)
        }
    }

    // MARK: - Compartir y archivos

    @MainActor
    private func compartir(elementos: [Any]) {
        guard let vc = controladorVisible() else { return }
        let hoja = UIActivityViewController(activityItems: elementos, applicationActivities: nil)
        // En iPad la hoja necesita saber de dónde sale o la app se cae.
        if let pop = hoja.popoverPresentationController {
            pop.sourceView = vc.view
            pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 40, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        vc.present(hoja, animated: true)
    }

    @MainActor
    private func guardarArchivo(nombre: String, texto: String) throws {
        let destino = FileManager.default.temporaryDirectory.appendingPathComponent(nombre)
        try texto.write(to: destino, atomically: true, encoding: .utf8)
        guard let vc = controladorVisible() else { return }
        vc.present(UIDocumentPickerViewController(forExporting: [destino], asCopy: true), animated: true)
    }

    @MainActor
    private func abrirSelectorDeArchivo() {
        guard let vc = controladorVisible() else { return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .text])
        picker.delegate = self
        picker.allowsMultipleSelection = false
        vc.present(picker, animated: true)
    }

    @MainActor
    private func abrirSelectorDeFotos() {
        guard let vc = controladorVisible() else { return }
        // Sin `photoLibrary:` a propósito: así el selector no pide permiso de
        // acceso al carrete — el usuario elige una foto y solo esa llega a la app.
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        vc.present(picker, animated: true)
    }

    // MARK: - Avisos

    private func avisar(titulo: String, cuerpo: String) async {
        let centro = UNUserNotificationCenter.current()
        let permitido = (try? await centro.requestAuthorization(options: [.alert, .sound])) ?? false
        guard permitido else { return }
        let contenido = UNMutableNotificationContent()
        contenido.title = titulo
        contenido.body = cuerpo
        contenido.sound = .default
        try? await centro.add(UNNotificationRequest(identifier: UUID().uuidString,
                                                    content: contenido,
                                                    trigger: nil))
    }

    // MARK: - Utilidad

    @MainActor
    private func controladorVisible() -> UIViewController? {
        let escena = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var vc = escena?.keyWindow?.rootViewController
        while let siguiente = vc?.presentedViewController { vc = siguiente }
        return vc
    }
}

// MARK: - Selector de fotos

extension PuenteNativo: PHPickerViewControllerDelegate {

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let id = pendienteFoto else { return }
        pendienteFoto = nil

        guard let proveedor = results.first?.itemProvider,
              proveedor.canLoadObject(ofClass: UIImage.self) else {
            responder(id: id, ok: false, resultado: nil, error: "No elegiste ninguna foto.")
            return
        }

        proveedor.loadObject(ofClass: UIImage.self) { [weak self] objeto, _ in
            guard let self else { return }
            guard let imagen = objeto as? UIImage,
                  let jpeg = imagen.jpegData(compressionQuality: 0.9) else {
                self.responder(id: id, ok: false, resultado: nil, error: "Esa foto no se pudo leer.")
                return
            }
            self.responder(id: id,
                           ok: true,
                           resultado: ["dataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString()],
                           error: nil)
        }
    }
}

// MARK: - Selector de archivos

extension PuenteNativo: UIDocumentPickerDelegate {

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let id = pendienteArchivo else { return }
        pendienteArchivo = nil
        guard let url = urls.first else {
            responder(id: id, ok: false, resultado: nil, error: "No elegiste ningún archivo.")
            return
        }
        // Lo que viene de la app Archivos llega protegido: hay que pedir acceso.
        let abierto = url.startAccessingSecurityScopedResource()
        defer { if abierto { url.stopAccessingSecurityScopedResource() } }
        do {
            let texto = try String(contentsOf: url, encoding: .utf8)
            responder(id: id, ok: true,
                      resultado: ["texto": texto, "nombre": url.lastPathComponent], error: nil)
        } catch {
            responder(id: id, ok: false, resultado: nil, error: "Ese archivo no se pudo leer.")
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let id = pendienteArchivo else { return }
        pendienteArchivo = nil
        responder(id: id, ok: false, resultado: nil, error: "Cancelado.")
    }
}
