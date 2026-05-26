import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@secondseat/db',
    '@tiptap/core',
    '@tiptap/pm',
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/extension-underline',
    '@tiptap/extension-superscript',
    '@tiptap/extension-subscript',
  ],
  webpack(config) {
    // Allow TypeScript workspace packages that use .js extensions in their
    // internal imports (TypeScript "Bundler" moduleResolution convention).
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
