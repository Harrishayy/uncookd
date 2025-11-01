"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, InformationCircleIcon, VideoCameraIcon } from "@heroicons/react/24/outline";

export default function Header() {
  const pathname = usePathname();
  
  const navItems = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/about", label: "About", icon: InformationCircleIcon },
    { href: "/meeting", label: "Meeting", icon: VideoCameraIcon },
  ];

  return (
    <header className="w-full bg-black border-b border-gray-900 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <nav className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <span className="text-black font-bold text-sm">U</span>
            </div>
            <span className="text-xl font-bold text-white">
              Uncookd
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white text-black border border-gray-800"
                      : "text-gray-400 hover:text-white hover:bg-black border border-transparent hover:border-gray-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
