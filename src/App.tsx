import { APP_NAME } from './config'
import { PixelCloud } from './components/PixelCloud'
import { PixelHeart } from './components/PixelHeart'
import { Slime } from './components/Slime'
import './App.css'

/** Task 01 placeholder landing page — used to verify the deployment pipeline. */
export function App() {
  return (
    <main className="scene">
      <PixelCloud className="cloud cloud--a" />
      <PixelCloud className="cloud cloud--b" />
      <PixelCloud className="cloud cloud--c" />

      <header className="hero">
        <h1 className="title">{APP_NAME}</h1>
        <p className="badge">
          <PixelHeart className="badge__heart" />
          <span>قريبًا</span>
        </p>
      </header>

      <div className="stage">
        <Slime className="slime" />
      </div>

      <div className="ground" aria-hidden="true" />
    </main>
  )
}
