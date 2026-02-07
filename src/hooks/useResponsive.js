import { useState, useEffect } from 'react'

export const useResponsive = () => {
  const [screenSize, setScreenSize] = useState({
    isMobile: false,
    isTablet: false,
    isSmallLaptop: false,
    isDesktop: false,
    isLargeDesktop: false,
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setScreenSize({
        isMobile: width < 576,
        isTablet: width >= 576 && width < 768,
        isSmallLaptop: width >= 768 && width < 992,
        isDesktop: width >= 992 && width < 1200,
        isLargeDesktop: width >= 1200,
        width,
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return screenSize
}
