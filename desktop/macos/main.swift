import AppKit
import WebKit
import UniformTypeIdentifiers

final class JournalApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    let testing = ProcessInfo.processInfo.environment["WORKJOURNAL_TEST_MODE"] == "1"
    let server = Process()
    var window: NSWindow!
    var web: WKWebView!
    var children: [NSWindow] = []
    var printer: WKWebView?
    var printWindow: NSWindow?
    var printDestination: URL?
    var exportTimer: Timer?
    var exportBusy = false
    var activePrintOperation: NSPrintOperation?
    var origin = "http://127.0.0.1:43171"
    var dataURL: URL!
    var launchOverlay: NSView?
    var launchTicker: Timer?
    let launchedAt = Date()
    func trace(_ text: String) { if testing { FileHandle.standardError.write(Data((text + "\n").utf8)) } }

    func applicationDidFinishLaunching(_ notification: Notification) {
        trace("native: application launched")
        let env = ProcessInfo.processInfo.environment
        let port = Int(env["WORKJOURNAL_PORT"] ?? "43171") ?? 43171
        origin = "http://127.0.0.1:\(port)"
        dataURL = env["WORKJOURNAL_DATA_DIR"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("WorkJournal/data")
        let menu = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: "退出Work Log", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; menu.addItem(appItem)
        let editItem = NSMenuItem(), editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu; menu.addItem(editItem); NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        if testing { config.websiteDataStore = .nonPersistent() }
        config.userContentController.add(self, name: "journal")
        let bridge = """
        window.workJournalDesktop=true;window.workJournalPlatform="mac";
        window.__workLogErrors=[];window.addEventListener('error',e=>window.__workLogErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__workLogErrors.push(String(e.reason)));
        const listeners=new Set();
        window.chrome={webview:{postMessage:m=>{if(m.type==='app-ready')window.__workLogReady=true;window.webkit.messageHandlers.journal.postMessage(m)},addEventListener:(t,f)=>{if(t==='message')listeners.add(f)}}};
        window.__journalNativeResult=m=>listeners.forEach(f=>f({data:m}));
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Work Log"; window.minSize = NSSize(width: 380, height: 440)
        window.titleVisibility = .hidden; window.titlebarAppearsTransparent = true; window.styleMask.insert(.fullSizeContentView)
        let host = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 850))
        web.frame = host.bounds; web.autoresizingMask = [.width, .height]; host.addSubview(web)
        let overlay = NSView(frame: host.bounds); overlay.autoresizingMask = [.width, .height]; overlay.wantsLayer = true
        overlay.layer?.backgroundColor = NSColor(calibratedRed: 0.973, green: 0.98, blue: 0.973, alpha: 1).cgColor
        let logo = NSImageView(); logo.image = NSApp.applicationIconImage
        logo.widthAnchor.constraint(equalToConstant: 64).isActive = true; logo.heightAnchor.constraint(equalToConstant: 64).isActive = true
        let title = NSTextField(labelWithString: "Work Log"); title.font = .systemFont(ofSize: 22, weight: .medium)
        let elapsed = NSTextField(labelWithString: "正在打开 · 0.0 秒"); elapsed.font = .systemFont(ofSize: 12); elapsed.textColor = .secondaryLabelColor
        let progress = NSProgressIndicator(); progress.style = .bar; progress.isIndeterminate = true; progress.widthAnchor.constraint(equalToConstant: 150).isActive = true; progress.startAnimation(nil)
        let stack = NSStackView(views: [logo, title, elapsed, progress]); stack.orientation = .vertical; stack.spacing = 14; stack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(stack); NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor), stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor)])
        host.addSubview(overlay); launchOverlay = overlay
        launchTicker = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in guard let self = self else { return }; elapsed.stringValue = String(format: "正在打开 · %.1f 秒", Date().timeIntervalSince(self.launchedAt)) }
        window.contentView = host; window.center()
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        Task { await start(port: port) }
    }

    @MainActor func start(port: Int) async {
        do {
            try FileManager.default.createDirectory(at: dataURL, withIntermediateDirectories: true)
            guard let resources = Bundle.main.resourceURL else { throw failure("安装文件不完整") }
            let appRoot = resources.appendingPathComponent("app"), token = UUID().uuidString
            server.executableURL = resources.appendingPathComponent("runtime/node")
            server.arguments = [appRoot.appendingPathComponent("server/index.js").path]
            server.currentDirectoryURL = appRoot
            var env = ProcessInfo.processInfo.environment
            env["PORT"] = String(port); env["DATA_DIR"] = dataURL.path
            env["PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier); env["INSTANCE_TOKEN"] = token
            // Do not inherit Node injection flags from a developer's shell.
            env.removeValue(forKey: "NODE_OPTIONS"); server.environment = env
            server.standardOutput = FileHandle.nullDevice; server.standardError = FileHandle.nullDevice
            try server.run()
            let session = URLSession(configuration: { let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 1; return c }())
            defer { session.invalidateAndCancel() }
            var ready = false
            for _ in 0..<100 {
                if !server.isRunning { throw failure("本机服务无法启动，请检查是否已有Work Log正在运行。") }
                if let (bytes, _) = try? await session.data(from: URL(string: origin + "/api/status")!),
                   let status = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], status["instance"] as? String == token { ready = true; break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            guard ready else { throw failure("启动超时，请关闭后重新打开。") }
            trace("native: backend ready")
            web.load(URLRequest(url: URL(string: origin)!))
            if testing { await smoke() }
        } catch { failStartup(error) }
    }
    func failure(_ text: String) -> NSError { NSError(domain: "WorkJournal", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    func failStartup(_ error: Error) {
        trace("native failure: \(error)")
        if testing { try? String(describing: error).write(to: dataURL.appendingPathComponent("smoke-error.txt"), atomically: true, encoding: .utf8) }
        else { let a = NSAlert(); a.messageText = "无法打开Work Log"; a.informativeText = error.localizedDescription; a.runModal() }
        NSApp.terminate(nil)
    }
    func local(_ url: URL?) -> Bool { guard let url = url else { return false }; return url.scheme == "http" && url.host == "127.0.0.1" && url.port == URL(string: origin)?.port }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { if server.isRunning { server.terminate() } }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if webView === printer { decisionHandler(action.request.url?.absoluteString == "about:blank" || local(action.request.url) ? .allow : .cancel); return }
        let blob = action.request.url?.absoluteString.hasPrefix("blob:" + origin + "/") == true
        guard local(action.request.url) || blob else { decisionHandler(.cancel); return }
        decisionHandler(action.shouldPerformDownload ? .download : .allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") == true
        decisionHandler(response.canShowMIMEType && !attachment ? .allow : .download)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let name = (suggestedFilename as NSString).lastPathComponent
        if testing { completionHandler(dataURL.appendingPathComponent(name)); return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = name
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard local(action.request.url) else { return nil }
        let viewer = WKWebView(frame: .zero, configuration: configuration); viewer.navigationDelegate = self; viewer.uiDelegate = self
        let child = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 700), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        child.title = "附件 · Work Log"; child.contentView = viewer; child.isReleasedWhenClosed = false
        children.removeAll { !$0.isVisible }; children.append(child); child.center(); child.makeKeyAndOrderFront(nil); return viewer
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, local(message.frameInfo.request.url), message.webView === web,
              let body = message.body as? [String: Any] else { return }
        if body["type"] as? String == "app-ready" { launchOverlay?.removeFromSuperview(); launchOverlay = nil; launchTicker?.invalidate(); launchTicker = nil; return }
        if body["type"] as? String == "set-theme" {
            if let encoded = body["png"] as? String, encoded.count < 150000,
               let data = Data(base64Encoded: encoded), let icon = NSImage(data: data) { NSApp.applicationIconImage = icon }
            return
        }
        guard body["type"] as? String == "export-report", let html = body["html"] as? String, let title = body["title"] as? String else { return }
        guard !exportBusy else { return }; exportBusy = true
        guard html.utf8.count < 12_000_000 else { finishExport(false, "所选内容过多，请分批导出。"); return }
        if testing { renderPDF(html, destination: dataURL.appendingPathComponent("report.pdf")); return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.pdf]
        panel.nameFieldStringValue = String(title.prefix(80)).replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_") + ".pdf"
        panel.beginSheetModal(for: window) { result in
            if result == .OK, let url = panel.url { self.renderPDF(html, destination: url) }
            else { self.finishExport(false, "已取消导出") }
        }
    }
    func renderPDF(_ html: String, destination: URL) {
        printDestination = destination
        let config = WKWebViewConfiguration(); config.defaultWebpagePreferences.allowsContentJavaScript = false
        printer = WKWebView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123), configuration: config)
        printWindow = NSWindow(contentRect: printer!.frame, styleMask: [], backing: .buffered, defer: false)
        printWindow?.isReleasedWhenClosed = false
        printWindow?.contentView = printer; printer?.navigationDelegate = self
        printer?.loadHTMLString(html, baseURL: URL(string: origin))
        exportTimer = Timer.scheduledTimer(withTimeInterval: 25, repeats: false) { _ in self.finishExport(false, "PDF 排版超时，请重试") }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        trace("native: navigation finished \(webView.url?.absoluteString ?? "none")")
        guard webView === printer, let destination = printDestination else { return }
        let info = NSPrintInfo(); info.paperSize = NSSize(width: 595.276, height: 841.89)
        info.topMargin = 0; info.bottomMargin = 0; info.leftMargin = 0; info.rightMargin = 0
        info.horizontalPagination = .fit; info.verticalPagination = .automatic
        info.isHorizontallyCentered = false; info.isVerticallyCentered = false
        info.jobDisposition = .save; info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = destination
        let operation = webView.printOperation(with: info); operation.showsPrintPanel = false; operation.showsProgressPanel = false
        activePrintOperation = operation
        operation.runModal(for: window, delegate: self, didRun: #selector(printFinished(_:success:contextInfo:)), contextInfo: nil)
    }
    @objc func printFinished(_ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        let ok = success && printDestination.map { FileManager.default.fileExists(atPath: $0.path) } == true
        // Keep WebKit's print view alive until AppKit has unwound its completion callback.
        DispatchQueue.main.async {
            self.activePrintOperation = nil
            self.finishExport(ok, ok ? "PDF 已保存" : "PDF 导出未完成，请重试")
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if webView === printer { finishExport(false, "PDF 排版失败，请重试") } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if webView === printer { finishExport(false, "PDF 排版失败，请重试") } }
    func finishExport(_ success: Bool, _ message: String) {
        exportTimer?.invalidate(); exportTimer = nil; exportBusy = false
        printer?.stopLoading(); printer = nil; printWindow?.close(); printWindow = nil; printDestination = nil
        if let bytes = try? JSONSerialization.data(withJSONObject: ["type": "report-result", "success": success, "message": message]), let encoded = String(data: bytes, encoding: .utf8) {
            web.evaluateJavaScript("window.__journalNativeResult(\(encoded))", completionHandler: nil)
        }
    }
    @MainActor func waitScript(_ expression: String) async throws {
        for attempt in 0..<450 {
            if let result = try? await web.evaluateJavaScript(expression), result as? Bool == true { return }
            if attempt % 100 == 0 {
                let state = try? await web.evaluateJavaScript("JSON.stringify({ready:window.__workLogReady,errors:window.__workLogErrors,form:!!document.querySelector('#record-form'),theme:getComputedStyle(document.documentElement).getPropertyValue('--green')})")
                trace("native: waiting \(expression) \(String(describing: state))")
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw failure("Desktop test timed out: " + expression)
    }
    @MainActor func smoke() async {
        do {
            try await waitScript("window.__workLogReady === true && !!document.querySelector('#record-form')")
            trace("native: frontend ready; running smoke")
            let path = ProcessInfo.processInfo.environment["WORKJOURNAL_TEST_SCRIPT"]!
            let script = try String(contentsOfFile: path, encoding: .utf8)
            _ = try await web.evaluateJavaScript(script + "\n;void 0;")
            try await waitScript("!!window.__desktopTestDone")
            let result = try await web.evaluateJavaScript("JSON.stringify(window.__desktopTestResult)") as? String ?? "{}"
            try result.write(to: dataURL.appendingPathComponent("smoke-result.json"), atomically: true, encoding: .utf8)
            NSApp.terminate(nil)
        } catch { failStartup(error) }
    }
}

let application = NSApplication.shared
let delegate = JournalApp()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()

