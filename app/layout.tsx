import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

/** WebView 加载 .../assets/web/index.html 时，根绝对路径 /icon.png 会落到主机根，无法映射到 assets；与 assetPrefix ./ 一致用相对路径。 */
const iconBase =
  process.env.NEXT_STATIC_ASSET_PREFIX === './' ? './' : '/'

export const metadata: Metadata = {
  title: 'PS² 内心议会',
  description: '探索内心的多元声音，让AI帮助您做出更明智的决策',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: `${iconBase}icon-light-32x32.png`,
        media: '(prefers-color-scheme: light)',
      },
      {
        url: `${iconBase}icon-dark-32x32.png`,
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: `${iconBase}icon.svg`,
        type: 'image/svg+xml',
      },
    ],
    apple: `${iconBase}apple-icon.png`,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
