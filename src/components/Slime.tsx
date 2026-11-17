import { pixelRects } from './pixelRects'
import './Slime.css'

/* Body without eyes; the eyes are drawn separately so they can blink and look around. */
const BODY = [
  '......OOOOOO......',
  '....OOGGGGGGOO....',
  '...OGGGGGGGGLWGO..',
  '..OGGGGGGGGGGLLGO.',
  '.OGGGGGGGGGGGGLGO.',
  '.OGGGGGGGGGGGGGGO.',
  '.OGGGGGGGGGGGGGGO.',
  'ODGGGPGGGGGGPGGGGO',
  'ODGGGGGGGGGGGGGGDO',
  'OBDGGGGGGGGGGGGDBO',
  'OBBDDGGGGGGGGDDBBO',
  '.OBBBBBBBBBBBBBBO.',
  '..OOOOOOOOOOOOOO..',
] as const

const PALETTE = {
  O: '#2a1d5c', // outline
  G: '#2fe04a', // body
  L: '#a6ff8f', // shine
  W: '#ffffff', // highlight
  D: '#14a84a', // shade
  B: '#2f9aa6', // underside
  P: '#ff8fb1', // cheeks
}

const EYE = '#1a1a2e'

/** The game's mascot: an original green slime that idles, hops, blinks and glances around. */
export function Slime({ className = '' }: { className?: string }) {
  return (
    <div className={`slime ${className}`}>
      <span className="slime__shadow" aria-hidden="true" />
      <svg
        className="slime__body"
        viewBox="0 0 18 13"
        shapeRendering="crispEdges"
        role="img"
        aria-label="سلايم أخضر لطيف يقفز فوق العشب"
      >
        {pixelRects(BODY, PALETTE)}
        <g className="slime__eyes">
          <g className="slime__pupils">
            <rect x={6} y={5} width={1} height={2} fill={EYE} />
            <rect x={11} y={5} width={1} height={2} fill={EYE} />
          </g>
        </g>
      </svg>
    </div>
  )
}
