import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for Story-style navigation controls
 * Supports tap navigation, auto-play, and keyboard controls
 */
const useStoryControls = (totalSlides, autoPlayDuration = 5000) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Navigate to next slide
    const nextSlide = useCallback(() => {
        setCurrentSlide(prev => {
            if (prev < totalSlides - 1) {
                return prev + 1;
            }
            return prev; // Stay on last slide
        });
    }, [totalSlides]);

    // Navigate to previous slide
    const prevSlide = useCallback(() => {
        setCurrentSlide(prev => {
            if (prev > 0) {
                return prev - 1;
            }
            return prev; // Stay on first slide
        });
    }, []);

    // Handle tap/click navigation
    // Left 1/3 = previous, Right 2/3 = next
    const handleTap = useCallback((e) => {
        const screenWidth = window.innerWidth;
        const tapX = e.clientX;

        if (tapX < screenWidth / 3) {
            prevSlide();
        } else {
            nextSlide();
        }
    }, [nextSlide, prevSlide]);

    // Toggle pause state
    const togglePause = useCallback(() => {
        setIsPaused(prev => !prev);
    }, []);

    // Auto-play timer
    useEffect(() => {
        if (!isPaused && currentSlide < totalSlides - 1) {
            const timer = setTimeout(() => {
                nextSlide();
            }, autoPlayDuration);

            return () => clearTimeout(timer);
        }
    }, [currentSlide, isPaused, totalSlides, autoPlayDuration, nextSlide]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            switch (e.key) {
                case 'ArrowLeft':
                    prevSlide();
                    break;
                case 'ArrowRight':
                    nextSlide();
                    break;
                case ' ':
                    e.preventDefault();
                    togglePause();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nextSlide, prevSlide, togglePause]);

    return {
        currentSlide,
        setCurrentSlide,
        nextSlide,
        prevSlide,
        handleTap,
        isPaused,
        setIsPaused,
        togglePause
    };
};

export default useStoryControls;
