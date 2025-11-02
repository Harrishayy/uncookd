"use client";

export default function Footer() {
  return (
    <footer className="w-full bg-gray-900 border-t border-gray-800 backdrop-blur-xl mt-12">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between h-16 text-gray-400 text-sm">
          <p className="text-center sm:text-left">
            © {new Date().getFullYear()}{" "}
            <span className="font-semibold text-gray-200">Uncookd</span>. All
            rights reserved.
          </p>

          <div className="flex gap-4 mt-2 sm:mt-0">
            <a
              href="/privacy"
              className="hover:text-gray-200 transition-colors duration-200"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="hover:text-gray-200 transition-colors duration-200"
            >
              Terms
            </a>
            <a
              href="mailto:contact@uncookd.io"
              className="hover:text-gray-200 transition-colors duration-200"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
