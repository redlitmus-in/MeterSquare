import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ModernLoadingSpinners from './ModernLoadingSpinners';

interface CreativeErrorPageProps {
  variant?: 'floating-shapes' | 'liquid-motion' | 'particle-field' | 'geometric-maze' | 'wave-distortion';
  errorCode?: string;
  errorTitle?: string;
  errorMessage?: string;
  onRefresh?: () => void;
}

const CreativeErrorPage: React.FC<CreativeErrorPageProps> = ({
  variant = 'floating-shapes',
  errorCode = '404',
  errorTitle,
  errorMessage,
  onRefresh
}) => {
  const navigate = useNavigate();

  // Variant 1: Floating Shapes with Depth
  const FloatingShapesError = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 overflow-hidden">
      {/* Floating 3D shapes */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              x: [0, Math.random() * 200 - 100],
              y: [0, Math.random() * 200 - 100],
              rotate: [0, 360],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            <div 
              className={`w-${8 + i * 4} h-${8 + i * 4} ${
                i % 3 === 0 ? 'bg-red-500/10' : i % 3 === 1 ? 'bg-blue-500/10' : 'bg-green-500/10'
              } rounded-lg backdrop-blur-sm`}
              style={{
                transform: 'perspective(100px) rotateX(45deg) rotateY(45deg)',
              }}
            />
          </motion.div>
        ))}
      </div>

      <div className="relative z-10">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
        >
          {/* Central error display */}
          <div className="text-center">
            <motion.div
              className="relative inline-block"
              animate={{ 
                rotateY: [0, 180, 360],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            >
              <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-blue-400 to-green-400">
                {errorCode}
              </h1>
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-8 space-y-4"
            >
              {(errorTitle || errorMessage) && (
                <div className="mb-6">
                  {errorTitle && <h2 className="text-2xl font-semibold text-white mb-2">{errorTitle}</h2>}
                  {errorMessage && <p className="text-white/70">{errorMessage}</p>}
                </div>
              )}
              <div className="flex justify-center gap-2">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i === 0 ? 'bg-red-500' : i === 1 ? 'bg-blue-500' : 'bg-green-500'
                    }`}
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              
              <button
                onClick={() => navigate('/')}
                className="px-8 py-4 bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all transform hover:scale-105 border border-white/20"
              >
                Continue
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );

  // Variant 2: Liquid Motion
  const LiquidMotionError = () => (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center p-4 overflow-hidden relative">
      {/* Subtle Background Pattern - same as login page left side */}
      <div className="absolute inset-0">
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
      </div>
      
      {/* Liquid blobs */}
      <div className="absolute inset-0">
        <svg className="w-full h-full">
          <defs>
            <filter id="liquid">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
              <feColorMatrix values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 20 -10
              " />
            </filter>
          </defs>
          
          <g filter="url(#liquid)">
            <motion.circle
              cx="30%"
              cy="50%"
              r="120"
              fill="#ef4444"
              animate={{
                cx: ["30%", "70%", "30%"],
                cy: ["50%", "30%", "50%"],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="70%"
              cy="50%"
              r="100"
              fill="#3b82f6"
              animate={{
                cx: ["70%", "30%", "70%"],
                cy: ["50%", "70%", "50%"],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="50%"
              cy="50%"
              r="80"
              fill="#10b981"
              animate={{
                scale: [1, 1.5, 1],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </g>
        </svg>
      </div>

      <div className="relative z-10 text-center">
        <motion.h1
          className="text-8xl font-bold text-gray-900"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10 }}
        >
          {errorCode}
        </motion.h1>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          {errorTitle && <h2 className="text-2xl font-semibold text-gray-800 mb-3">{errorTitle}</h2>}
          <p className="text-gray-600 mb-8 text-lg">{errorMessage || "The page you're looking for seems to be missing"}</p>
          <motion.button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-gradient-to-r from-gray-800 to-gray-700 text-white rounded-lg shadow-lg hover:from-gray-700 hover:to-gray-600 hover:shadow-xl transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    </div>
  );

  // Variant 3: Particle Field
  const ParticleFieldError = () => (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-4">
      {/* Particle system */}
      <div className="absolute inset-0">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [-20, 20],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* Connecting lines */}
      <svg className="absolute inset-0 w-full h-full">
        {[...Array(5)].map((_, i) => (
          <motion.line
            key={i}
            x1={`${20 + i * 15}%`}
            y1="50%"
            x2={`${30 + i * 15}%`}
            y2="50%"
            stroke={i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? '#3b82f6' : '#10b981'}
            strokeWidth="0.5"
            opacity="0.3"
            animate={{
              y1: ["45%", "55%", "45%"],
              y2: ["55%", "45%", "55%"],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </svg>

      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center"
        >
          <div className="relative inline-block">
            <h1 className="text-8xl font-thin text-white tracking-widest">
              {errorCode}
            </h1>
            <motion.div
              className="absolute -bottom-2 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 via-blue-500 to-green-500"
              animate={{ scaleX: [0, 1, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>

          {(errorTitle || errorMessage) && (
            <div className="mt-8">
              {errorTitle && <h2 className="text-2xl font-medium text-white mb-2">{errorTitle}</h2>}
              {errorMessage && <p className="text-white/60">{errorMessage}</p>}
            </div>
          )}

          <div className="mt-12 flex justify-center gap-4">
            <motion.button
              onClick={() => navigate(-1)}
              className="px-6 py-3 text-white/70 hover:text-white transition-colors"
              whileHover={{ x: -5 }}
            >
              ← Back
            </motion.button>
            <motion.button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              whileHover={{ scale: 1.05 }}
            >
              Home
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );

  // Variant 4: Geometric Maze
  const GeometricMazeError = () => (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 overflow-hidden">
      {/* Maze pattern */}
      <div className="absolute inset-0">
        <div className="relative w-full h-full">
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute border-2 border-gray-100"
              style={{
                width: `${100 + i * 50}px`,
                height: `${100 + i * 50}px`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
              animate={{
                rotate: i % 2 === 0 ? [0, 90] : [0, -90],
              }}
              transition={{
                duration: 20 + i * 2,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10">
        <motion.div
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white p-12 rounded-2xl shadow-2xl"
        >
          <h1 className="text-7xl font-bold text-center mb-8">
            <span className="text-red-500">{errorCode[0]}</span>
            <span className="text-blue-500">{errorCode[1]}</span>
            <span className="text-green-500">{errorCode[2]}</span>
          </h1>
          
          <div className="flex justify-center gap-1 mb-8">
            <motion.div className="w-8 h-1 bg-red-500" animate={{ scaleX: [1, 0, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            <motion.div className="w-8 h-1 bg-blue-500" animate={{ scaleX: [1, 0, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0.2 }} />
            <motion.div className="w-8 h-1 bg-green-500" animate={{ scaleX: [1, 0, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0.4 }} />
          </div>

          {(errorTitle || errorMessage) && (
            <div className="mb-6 text-center">
              {errorTitle && <h2 className="text-xl font-semibold text-gray-800 mb-2">{errorTitle}</h2>}
              {errorMessage && <p className="text-gray-600">{errorMessage}</p>}
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Exit
          </button>
        </motion.div>
      </div>
    </div>
  );

  // Variant 5: Wave Distortion
  const WaveDistortionError = () => (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      {/* Wave layers */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-full"
            style={{
              height: '200%',
              background: `linear-gradient(180deg, transparent, ${
                i === 0 ? 'rgba(239, 68, 68, 0.1)' : i === 1 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)'
              }, transparent)`,
              bottom: '-100%',
            }}
            animate={{
              y: ['100%', '-100%'],
            }}
            transition={{
              duration: 10 + i * 2,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        <motion.div
          animate={{
            y: [0, -10, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="text-center"
        >
          <h1 className="text-9xl font-black text-white/20 select-none">
            {errorCode}
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <h2 className="text-6xl font-bold text-white">
              {errorCode}
            </h2>
          </div>
        </motion.div>

        {(errorTitle || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            {errorTitle && <h2 className="text-2xl font-semibold text-white mb-2">{errorTitle}</h2>}
            {errorMessage && <p className="text-white/70">{errorMessage}</p>}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 flex justify-center"
        >
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-white/20 backdrop-blur-sm text-white rounded-full border border-white/30 hover:bg-white/30 transition-all"
          >
            Continue
          </button>
        </motion.div>
      </div>
    </div>
  );

  switch(variant) {
    case 'liquid-motion':
      return <LiquidMotionError />;
    case 'particle-field':
      return <ParticleFieldError />;
    case 'geometric-maze':
      return <GeometricMazeError />;
    case 'wave-distortion':
      return <WaveDistortionError />;
    default:
      return <FloatingShapesError />;
  }
};

export default CreativeErrorPage;