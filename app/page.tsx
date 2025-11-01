import Header from "./components/Header";
import Footer from "./components/Footer"

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col bg-black text-white">
      {/* Header stays at the top */}
      <Header />

      {/* Centered hero section */}
      <div className="flex-grow flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold">
            Uncookd
          </h1>
          <p className="mt-4 text-lg md:text-xl max-w-2xl mx-auto font-light text-gray-400">
            A collaborative virtual classroom where you and personalised AI agents
            can debate, discuss, and visualise ideas together — all on a shared
            whiteboard.
          </p>
        </div>
      </div>
    <Footer />
    </main>
  );
}
