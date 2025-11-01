// import logo from "../logo.svg";
import Link from "next/link";

export default function Header() {
    return (
        <header className="w-full bg-[#181a1b] shadow-md py-4 px-8 flex items-center justify-between">
            {/* <img src={logo} className="App-logo" alt="logo" /> */}
            <nav className="flex gap-6">
                <Link href="/" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200">Home</Link>
                <Link href="/about" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200">About</Link>
                <Link href="/meeting" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200">Meeting</Link>
                <Link href="/meeting-config" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200">Meeting Config</Link>
            </nav>
        </header>
    );
}
