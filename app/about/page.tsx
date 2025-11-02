import Header from "../components/Header";
import Footer from "../components/Footer";

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col bg-gray-950 text-white">
      <Header />

      <div className="flex-grow flex items-center justify-center px-6">
        <div className="text-center max-w-3xl">
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-100">
            About Uncookd
          </h1>
          <p className="mt-6 text-lg md:text-xl font-light text-gray-400">
            Uncookd is a collaborative virtual classroom designed to let you explore,
            debate, and visualise ideas in real-time. Engage with personalised AI agents,
            interact with your peers, and co-create knowledge on a shared whiteboard.
          </p>
          <p className="mt-4 text-lg md:text-xl font-light text-gray-400">
            Whether you're brainstorming, teaching, or experimenting with ideas,
            Uncookd provides a seamless and interactive environment that makes
            collaboration intuitive, fun, and engaging.
          </p>
          <p className="mt-4 text-lg md:text-xl font-light text-gray-400">
            Our mission is to empower learning and creativity by combining human
            collaboration with AI assistance - all in one immersive digital space.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}
