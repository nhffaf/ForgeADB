import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import api from '../lib/api.js'

const DeviceContext = createContext(null)

const POLL_MS = 3000

export function DeviceProvider({ children }) {
  const [devices, setDevices] = useState([])
  const [selectedSerial, setSelectedSerial] = useState(null)
  const [info, setInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [scanning, setScanning] = useState(true)
  const pollRef = useRef(null)
  const selectedRef = useRef(null)

  const selected = devices.find((d) => d.serial === selectedSerial) || null
  selectedRef.current = selected

  const refreshDevices = useCallback(async () => {
    try {
      const list = await api.listDevices()
      setDevices(list)
      setSelectedSerial((prev) => {
        if (prev && list.some((d) => d.serial === prev)) return prev
        return list.length ? list[0].serial : null
      })
    } catch (e) {
      // keep last known list on transient errors
    } finally {
      setScanning(false)
    }
  }, [])

  const refreshInfo = useCallback(async () => {
    const dev = selectedRef.current
    if (!dev) {
      setInfo(null)
      return
    }
    setInfoLoading(true)
    try {
      const data = await api.getDeviceInfo(dev)
      // Only commit if still the selected device
      if (selectedRef.current && selectedRef.current.serial === dev.serial) {
        setInfo(data)
      }
    } catch (e) {
      setInfo(null)
    } finally {
      setInfoLoading(false)
    }
  }, [])

  // Poll the device list on an interval.
  useEffect(() => {
    refreshDevices()
    pollRef.current = setInterval(refreshDevices, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [refreshDevices])

  // Re-fetch info whenever the selected device (serial or mode) changes.
  useEffect(() => {
    refreshInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSerial, selected?.mode])

  const value = {
    devices,
    selected,
    selectedSerial,
    setSelectedSerial,
    info,
    infoLoading,
    scanning,
    refreshDevices,
    refreshInfo,
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  const ctx = useContext(DeviceContext)
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider')
  return ctx
}
