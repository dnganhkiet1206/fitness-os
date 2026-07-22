const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Let Metro bundle 3D models (react-three-fiber loads the koala GLB).
config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
