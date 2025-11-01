import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack configuration for Next.js 16
  turbopack: {
    resolveAlias: {
      // Alias client directory to a no-op for server-side builds
      '@/client': './client-stub.ts',
    },
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  
  // Ensure API routes use Node.js runtime and exclude client-side packages
  experimental: {
    serverComponentsExternalPackages: ['tldraw', '@tldraw/editor', '@tldraw/tlschema', '@tldraw/state-react'],
  },
  
  // Webpack fallback config (in case webpack is explicitly used)
  webpack: (config, { isServer }) => {
    // Exclude client directory from server-side bundles
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'tldraw': 'commonjs tldraw',
        '@tldraw/editor': 'commonjs @tldraw/editor',
        '@tldraw/tlschema': 'commonjs @tldraw/tlschema',
        '@/client': false,
      });
    }
    return config;
  },
};

export default nextConfig;
