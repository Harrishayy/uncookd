import TldrawBoard from "./components/TldrawBoard";

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <TldrawBoard boardId="main-board" />
    </div>
  );
}
