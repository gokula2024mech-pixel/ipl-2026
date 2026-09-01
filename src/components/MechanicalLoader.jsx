import React from 'react'

/**
 * MechanicalLoader
 * Precision mechanical interlocking gears loading animation.
 * Features 3 synchronized interlocking gears rotating smoothly with CSS keyframes.
 */
export default function MechanicalLoader({ size = 48, className = 'text-accent', ...props }) {
  // Generate a mathematically crisp gear path with a center axle hole
  const getGearPath = (cx, cy, rOut, rIn, teethCount, holeRadius) => {
    const points = []
    const angleStep = (Math.PI * 2) / teethCount

    for (let i = 0; i < teethCount; i++) {
      const angle = i * angleStep
      const a1 = angle
      const a2 = angle + angleStep * 0.25
      const a3 = angle + angleStep * 0.5
      const a4 = angle + angleStep * 0.75

      points.push(`${(cx + rIn * Math.cos(a1)).toFixed(2)},${(cy + rIn * Math.sin(a1)).toFixed(2)}`)
      points.push(`${(cx + rOut * Math.cos(a2)).toFixed(2)},${(cy + rOut * Math.sin(a2)).toFixed(2)}`)
      points.push(`${(cx + rOut * Math.cos(a3)).toFixed(2)},${(cy + rOut * Math.sin(a3)).toFixed(2)}`)
      points.push(`${(cx + rIn * Math.cos(a4)).toFixed(2)},${(cy + rIn * Math.sin(a4)).toFixed(2)}`)
    }

    const gearOutline = `M ${points.join(' L ')} Z`
    const centerHole = `M ${cx} ${cy} m -${holeRadius} 0 a ${holeRadius} ${holeRadius} 0 1 0 ${holeRadius * 2} 0 a ${holeRadius} ${holeRadius} 0 1 0 -${holeRadius * 2} 0`

    return `${gearOutline} ${centerHole}`
  }

  const gears = [
    {
      id: 'g1',
      cx: 45.5,
      cy: 39.0,
      rOut: 25.35,
      rIn: 20.8,
      teeth: 16,
      circleHole: 5.85,
      initialRotation: 0,
      animClass: 'mech-gear-cw-main',
      opacity: '1'
    },
    {
      id: 'g2',
      cx: 79.3,
      cy: 60.45,
      rOut: 19.24,
      rIn: 14.95,
      teeth: 12,
      circleHole: 4.55,
      initialRotation: 15,
      animClass: 'mech-gear-ccw-sec',
      opacity: '0.85'
    },
    {
      id: 'g3',
      cx: 61.75,
      cy: 83.85,
      rOut: 13.65,
      rIn: 9.75,
      teeth: 8,
      circleHole: 2.86,
      initialRotation: 25,
      animClass: 'mech-gear-cw-tri',
      opacity: '0.7'
    }
  ]

  const height = Math.round(size * 1.07)

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-flex items-center justify-center ${className}`}
      {...props}
    >
      <svg
        width={size}
        height={height}
        viewBox="18 11 83 89"
        className="overflow-visible"
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes mech-gear-spin-cw {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes mech-gear-spin-ccw {
            from { transform: rotate(0deg); }
            to { transform: rotate(-360deg); }
          }
          .mech-gear-cw-main {
            animation: mech-gear-spin-cw 4s linear infinite;
          }
          .mech-gear-ccw-sec {
            animation: mech-gear-spin-ccw 3s linear infinite;
          }
          .mech-gear-cw-tri {
            animation: mech-gear-spin-cw 2s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .mech-gear-cw-main, .mech-gear-ccw-sec, .mech-gear-cw-tri {
              animation: none !important;
            }
          }
        `}} />

        {gears.map((g) => (
          <g
            key={g.id}
            className={g.animClass}
            style={{
              transformOrigin: `${g.cx}px ${g.cy}px`
            }}
          >
            <path
              d={getGearPath(g.cx, g.cy, g.rOut, g.rIn, g.teeth, g.circleHole)}
              fill="currentColor"
              fillRule="evenodd"
              opacity={g.opacity}
              transform={`rotate(${g.initialRotation}, ${g.cx}, ${g.cy})`}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}
