import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L, { LatLngBounds } from 'leaflet'

import 'leaflet/dist/leaflet.css'

import { Shipment } from './types'

const markerIcon = L.divIcon({
  className: 'scm-visual-map__marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const computeBounds = (shipments: Shipment[]) => {
  const nonZero = shipments.filter((shipment) => Number.isFinite(shipment.lat) && Number.isFinite(shipment.lon))
  if (!nonZero.length) {
    return new LatLngBounds([24.8, 66.9], [35.9, 74.6])
  }
  const bounds = new LatLngBounds([nonZero[0].lat, nonZero[0].lon], [nonZero[0].lat, nonZero[0].lon])
  nonZero.forEach((shipment) => {
    bounds.extend([shipment.lat, shipment.lon])
  })
  return bounds
}

const ShipmentsLayer = ({ shipments, follow }: { shipments: Shipment[]; follow: boolean }) => {
  const map = useMap()
  const bounds = useMemo(() => computeBounds(shipments), [shipments])

  useEffect(() => {
    if (!shipments.length) return
    if (follow) {
      map.flyToBounds(bounds, { maxZoom: 7, padding: [48, 48] })
    }
  }, [map, bounds, follow, shipments])

  return (
    <>
      {shipments.map((shipment) => (
        <Marker key={shipment.id} position={[shipment.lat, shipment.lon]} icon={markerIcon}>
          <Tooltip direction="top">
            <div className="scm-visual-map__tooltip">
              <strong>{shipment.label ?? shipment.id}</strong>
              <span>Speed {Math.round(shipment.speedKph ?? 0)} km/h</span>
              <span>Heading {Math.round((shipment.headingDeg ?? 0) % 360)}°</span>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}

type MapModalProps = {
  open: boolean
  shipments: Shipment[]
  follow: boolean
  onClose: () => void
  onToggleFollow: (value: boolean) => void
}

const modalRoot = () => document.body

export const MapModal: React.FC<MapModalProps> = ({ open, shipments, follow, onClose, onToggleFollow }) => {
  const bounds = useMemo(() => computeBounds(shipments), [shipments])
  if (!open) return null
  const element = (
    <div className="scm-visual-map-modal" role="dialog" aria-modal="true">
      <div className="scm-visual-map-modal__container">
        <header>
          <div>
            <h3>Logistics tracker</h3>
            <p>{shipments.length} active shipments</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close map">
            Close
          </button>
        </header>
        <div className="scm-visual-map-modal__map">
          <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: [48, 48] }}
            zoom={5}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
            className={follow ? 'is-following' : undefined}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Source: Esri, Maxar, Earthstar Geographics"
            />
            <ShipmentsLayer shipments={shipments} follow={follow} />
          </MapContainer>
        </div>
        <footer>
          <div className="scm-visual-map-modal__legend">
            <span className="marker" />
            <span>Shipment in flight</span>
          </div>
          <label className="scm-visual-map-modal__follow">
            <input type="checkbox" checked={follow} onChange={(event) => onToggleFollow(event.target.checked)} />
            Follow movement
          </label>
        </footer>
      </div>
    </div>
  )
  return createPortal(element, modalRoot())
}

export default MapModal
