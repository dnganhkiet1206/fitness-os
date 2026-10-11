module.exports = new Proxy(function(){return null}, { get: (t, k) => k === '__esModule' ? false : (k === 'default' ? module.exports : function(){ return null }) });
