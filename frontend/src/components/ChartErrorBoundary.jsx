import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ChartErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Chart Error Boundary caught an error:", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full min-h-[150px] bg-red-500/10 border border-red-500/20 rounded-[18px] flex flex-col items-center justify-center p-4 text-center">
                    <AlertTriangle className="text-red-500 mb-2" size={24} />
                    <p className="text-white font-bold text-sm mb-1">Chart Unavailable</p>
                    <p className="text-white/40 text-xs mb-3 max-w-[200px]">
                        Something went wrong while rendering this visualization.
                    </p>
                    <motion.button {...pressProps('row')}
 onClick={this.handleRetry}
 className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
 >
                        <RefreshCw size={12} />
                        Retry
                    </motion.button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ChartErrorBoundary;
