// js/sanityClient.js
// Browser-ready Sanity client for Career Unified
window.sanityClient = window.sanityClient || {
  fetch: async function(query) {
    const projectId = 'qjg5raj1';
    const dataset = 'production';
    const url = `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.result;
    } catch (err) {
      console.error('Sanity fetch error:', err);
      return [];
    }
  },

  // Image URL builder for Sanity images
  imageUrl: function(imageAsset) {
    if (!imageAsset) return null;
    
    const projectId = 'qjg5raj1';
    const dataset = 'production';
    
    // Extract image reference
    let ref = null;
    if (imageAsset.asset && imageAsset.asset._ref) {
      ref = imageAsset.asset._ref;
    } else if (imageAsset.asset && imageAsset.asset._id) {
      ref = imageAsset.asset._id;
    } else if (typeof imageAsset === 'string') {
      ref = imageAsset;
    }
    
    if (!ref) return null;
    
    // Parse the reference: image-{id}-{dimensions}-{format}
    const parts = ref.split('-');
    if (parts.length < 4) return null;
    
    const id = parts[1];
    const dimensions = parts[2];
    const format = parts[3];
    
    // Create a builder object with chainable methods
    const builder = {
      _width: null,
      _height: null,
      _fit: null,
      _quality: null,
      
      width: function(w) {
        this._width = w;
        return this;
      },
      
      height: function(h) {
        this._height = h;
        return this;
      },
      
      fit: function(mode) {
        // Valid modes: clip, crop, fill, fillmax, max, scale, min
        this._fit = mode;
        return this;
      },
      
      quality: function(q) {
        this._quality = q;
        return this;
      },
      
      url: function() {
        let baseUrl = `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${format}`;
        const params = [];
        
        if (this._width) params.push(`w=${this._width}`);
        if (this._height) params.push(`h=${this._height}`);
        if (this._fit) params.push(`fit=${this._fit}`);
        if (this._quality) params.push(`q=${this._quality}`);
        
        if (params.length > 0) {
          baseUrl += `?${params.join('&')}`;
        }
        
        return baseUrl;
      }
    };
    
    return builder;
  }
};

