export function DownloadAppPage() {
  return (
    <div className="min-h-screen bg-[#0A0A1B] flex flex-col items-center justify-center px-6 py-16">
      {/* Logo + Title */}
      <div className="flex flex-col items-center gap-6 mb-12">
        <img src="/app-icons/saleflow.png" alt="Saleflow" className="h-20 w-20 rounded-2xl shadow-2xl" />
        <div className="text-center">
          <h1 className="text-4xl font-light tracking-[-1px] text-white mb-3">
            Saleflow Dialer
          </h1>
          <p className="text-lg text-white/50 max-w-md">
            Den smarta dialern för säljteam. Ring, boka möten och följ upp — allt i en app.
          </p>
        </div>
      </div>

      {/* Download buttons */}
      <div className="flex flex-col sm:flex-row gap-4 mb-16">
        {/* macOS */}
        <a
          href="https://github.com/douglassiteflow-dev/saleflow-releases/releases/latest/download/Saleflow-Dialer-macOS.dmg"
          className="flex items-center gap-4 rounded-xl bg-white/10 border border-white/10 px-8 py-5 hover:bg-white/15 transition-colors no-underline group"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white" className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider">Ladda ner för</p>
            <p className="text-lg font-medium text-white -mt-0.5">macOS</p>
          </div>
        </a>

        {/* Windows */}
        <a
          href="https://github.com/douglassiteflow-dev/saleflow-releases/releases/latest/download/Saleflow-Dialer-Setup.exe"
          className="flex items-center gap-4 rounded-xl bg-white/10 border border-white/10 px-8 py-5 hover:bg-white/15 transition-colors no-underline group"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white" className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <path d="M3 12V6.75l6-1.32v6.48L3 12zm6.98.09l.02 6.63 5.98 1.28V12H9.98zm7.02-7.09v6.88h7V4.67l-7-.67zM17 12.12h7v6.95l-7 .93V12.12z" />
          </svg>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider">Ladda ner för</p>
            <p className="text-lg font-medium text-white -mt-0.5">Windows</p>
          </div>
        </a>

        {/* Linux — TODO: bygg AppImage */}
        <a
          href="https://github.com/douglassiteflow-dev/saleflow-releases/releases/latest/download/Saleflow-Dialer-macOS.dmg"
          className="flex items-center gap-4 rounded-xl bg-white/10 border border-white/10 px-8 py-5 hover:bg-white/15 transition-colors no-underline group"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white" className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.226-.373.37-.469.595-.1.226-.123.455-.163.695-.04.24-.032.46.003.685.048.312.144.627.31.917.27.481.636.853 1.041 1.164.35.267.749.463 1.17.566.126.03.259.063.35.063.025.002.045-.01.064-.023.04-.034.052-.091.025-.137-.014-.026-.038-.04-.064-.047-.39-.1-.76-.286-1.082-.527-.382-.29-.715-.647-.96-1.103-.146-.272-.235-.567-.28-.862-.03-.196-.037-.396-.003-.59.032-.198.05-.4.14-.6.08-.168.23-.29.4-.483.212-.237.415-.578.695-.873.078-.07.136-.177.17-.282.016-.053.028-.109.035-.167.017.007.032.012.048.016.17.05.34.065.52.074.18.008.364-.002.548-.037.256-.048.513-.119.762-.214.273-.103.53-.241.77-.4.228-.15.438-.32.625-.51.16-.164.25-.294.37-.462.143-.204.258-.418.343-.641.047-.129.084-.26.112-.393.021-.104.037-.21.048-.316.021-.204.031-.41.028-.618-.002-.185-.012-.37-.032-.555-.012-.12-.028-.24-.046-.36-.018-.12-.04-.238-.065-.355-.056-.276-.126-.546-.21-.81-.084-.264-.18-.52-.29-.77-.168-.382-.372-.744-.61-1.088-.24-.344-.515-.668-.82-.968l.4-.4c.37-.37.73-.75 1.05-1.17.33-.42.62-.87.86-1.36.24-.49.42-1.01.54-1.55.06-.26.09-.52.1-.79v-.05c-.01-.41-.07-.82-.18-1.21-.11-.39-.27-.76-.48-1.09-.21-.33-.47-.62-.77-.87-.3-.25-.64-.45-1-.6-.37-.16-.76-.27-1.16-.31-.1-.01-.2-.02-.31-.02l-.19.01c-.17.01-.33.04-.49.08-.16.04-.31.09-.46.16-.29.13-.55.31-.78.53-.23.22-.42.48-.56.77-.14.29-.24.6-.28.93-.05.33-.04.67.02 1 .06.33.17.64.33.93.08.14.17.27.27.39.1.12.21.22.33.31.12.09.25.17.38.23.13.07.27.12.42.15.07.01.13.02.2.02.07 0 .13-.01.2-.02.13-.03.26-.08.38-.15.12-.07.23-.16.33-.26.1-.1.18-.22.25-.35.13-.26.19-.55.17-.84-.02-.29-.1-.57-.24-.82-.14-.25-.34-.47-.57-.63-.12-.09-.25-.16-.39-.21-.07-.03-.14-.05-.22-.06-.07-.02-.15-.02-.22-.02-.15 0-.29.03-.43.08-.14.05-.27.13-.38.22-.22.19-.38.44-.47.72-.09.28-.12.58-.07.87.05.29.16.56.32.79.16.24.37.44.61.58.12.07.25.13.38.17.13.04.27.07.41.08.07 0 .14 0 .21-.01.14-.02.28-.06.41-.12.13-.06.25-.14.35-.23l.11-.12.01.02c.09.09.17.19.24.29.24.33.42.7.54 1.09.12.39.18.79.18 1.2v.04c-.01.25-.04.5-.09.75-.11.49-.28.96-.5 1.4-.22.44-.49.85-.8 1.23-.31.37-.65.72-1.01 1.06l-.44.42c.27.28.52.58.73.9.22.32.4.66.55 1.01.1.24.19.49.26.74.07.25.12.5.15.76.02.13.04.25.05.38.01.13.02.25.02.38 0 .18-.01.37-.03.55-.02.12-.04.24-.07.36-.01.04-.02.08-.03.12-.02.06-.04.13-.07.19-.02.04-.04.09-.07.13l-.01.02c-.1.14-.22.28-.36.4-.17.15-.36.29-.56.41-.2.12-.41.22-.63.3-.22.08-.44.14-.66.17-.16.02-.32.03-.48.03-.16 0-.32-.02-.48-.05-.06-.01-.11-.03-.16-.04-.02 0-.03 0-.05-.01.01.06.03.12.05.18.03.08.06.15.1.22.02.03.04.06.07.08.01.01.03.01.04.01.08 0 .16-.01.23-.03.39-.09.75-.27 1.07-.51.37-.28.68-.64.93-1.05.15-.26.26-.54.33-.84.03-.15.05-.3.06-.45.01-.08.01-.15.01-.23 0-.22-.02-.44-.06-.66-.03-.15-.07-.29-.11-.43-.12-.03-.23-.08-.35-.14-.38-.17-.72-.41-1.01-.71-.29-.3-.52-.65-.68-1.04-.09-.21-.15-.43-.19-.65-.02-.11-.03-.22-.04-.33V12c0-.16.01-.31.04-.47.04-.24.12-.47.22-.69.11-.22.24-.42.4-.6.08-.09.17-.17.26-.25l-.02-.02c-.02-.02-.04-.04-.05-.07-.03-.06-.03-.12-.01-.18.02-.06.06-.1.11-.13.02-.01.04-.02.06-.02z" />
          </svg>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider">Ladda ner för</p>
            <p className="text-lg font-medium text-white -mt-0.5">Linux</p>
          </div>
        </a>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full mb-16">
        <div className="text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-500/20 mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-white mb-1">Click-to-call</h3>
          <p className="text-xs text-white/40">Ring direkt via Telavox med ett klick</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-500/20 mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-white mb-1">Mötesbokning</h3>
          <p className="text-xs text-white/40">Boka möten med Teams-integration direkt</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-amber-500/20 mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-white mb-1">Notiser</h3>
          <p className="text-xs text-white/40">Påminnelser för möten och callbacks</p>
        </div>
      </div>

      {/* Version info */}
      <p className="text-xs text-white/20">
        Saleflow Dialer v1.0.0 · Kräver macOS 12+, Windows 10+, eller Ubuntu 20+
      </p>
    </div>
  );
}
