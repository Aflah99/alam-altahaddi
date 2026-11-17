import { PixelCloud } from './sprites'
import './Sky.css'

/** Banded retro sky with dithered seams, a drifting horizon cloud bank and slow clouds. */
export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky__band sky__band--1" />
      <div className="sky__band sky__band--2" />
      <div className="sky__band sky__band--3" />
      <div className="sky__band sky__band--4" />
      <div className="sky__band sky__band--5" />
      <div className="sky__horizon" />
      <PixelCloud className="sky__cloud sky__cloud--a" />
      <PixelCloud className="sky__cloud sky__cloud--b" />
      <PixelCloud className="sky__cloud sky__cloud--c" />
      <PixelCloud className="sky__cloud sky__cloud--d" />
    </div>
  )
}
