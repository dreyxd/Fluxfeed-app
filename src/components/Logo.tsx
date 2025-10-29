import React, { useState } from 'react'

type LogoProps = {
  className?: string
  size?: number // pixel size (square)
  src?: string
}

export default function Logo({ className = '', size = 36, src = '/logo.png' }: LogoProps) {
  const [errored, setErrored] = useState(false)
  return (
    <span className={`inline-flex items-center justify-center rounded-xl overflow-hidden ${className}`} style={{ width: size, height: size }}>
      {!errored ? (
        <img
          src={src}
          alt="Fluxfeed logo"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="h-full w-full bg-orange-600 text-black font-black flex items-center justify-center">F</span>
      )}
    </span>
  )
}
