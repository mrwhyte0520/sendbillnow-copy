export default function NotFound() {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-4 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5]">
        <h1 className="text-5xl md:text-5xl font-semibold text-[#2f3e1e] drop-shadow-lg">404</h1>
        <h1 className="text-2xl md:text-3xl font-semibold mt-6 text-[#2f3e1e]">This page has not been generated</h1>
        <p className="mt-4 text-xl md:text-2xl text-[#6b5c3b]">Tell me what you would like on this page</p>
      </div>
    );
  }