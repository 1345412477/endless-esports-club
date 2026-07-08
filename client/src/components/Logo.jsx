import React from 'react'

export default function Logo({ size = 'medium' }) {
  const sizeMap = {
    small: { width: 60, height: 30 },
    medium: { width: 100, height: 50 },
    large: { width: 140, height: 70 }
  }

  const { width, height } = sizeMap[size] || sizeMap.medium

  return (
    <div className={`logo-svg ${size}`}>
      <svg width={width} height={height} viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path 
            d="M 20 30 C 20 15, 35 15, 45 25 L 55 35 C 65 45, 80 45, 80 30 C 80 15, 65 15, 55 25 L 45 35 C 35 45, 20 45, 20 30 Z" 
            stroke="#1a73e8" 
            strokeWidth="2.5" 
            opacity="1"
          />
          <path 
            d="M 23 30 C 23 18, 36 18, 45 27 L 55 33 C 64 42, 77 42, 77 30 C 77 18, 64 18, 55 27 L 45 33 C 36 42, 23 42, 23 30 Z" 
            stroke="#4a90e2" 
            strokeWidth="2" 
            opacity="0.8"
          />
          <path 
            d="M 26 30 C 26 21, 37 21, 45 29 L 55 31 C 63 39, 74 39, 74 30 C 74 21, 63 21, 55 29 L 45 31 C 37 39, 26 39, 26 30 Z" 
            stroke="#7ab8f5" 
            strokeWidth="1.5" 
            opacity="0.6"
          />
          <circle cx="60" cy="30" r="2" fill="#ffffff" opacity="0.9"/>
        </g>
      </svg>
    </div>
  )
}
