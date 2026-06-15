// js/sanityClient.js
// Browser-ready Sanity client for Career Unified

const projectId = 'qjg5raj1'
const dataset = 'production'
const apiVersion = '2024-01-01'

const baseUrl = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}`

window.sanityClient = {
  // ===============================
  // RAW FETCH (for any query)
  // ===============================
  fetch: async function (query) {
    const url = `${baseUrl}?query=${encodeURIComponent(query)}`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.result
    } catch (err) {
      console.error('Sanity fetch error:', err)
      return []
    }
  },

  // ===============================
  // JOB-SAFE QUERY (FIXES [object Object])
  // ===============================
  fetchJobs: async function () {
    const today = new Date().toISOString().slice(0, 10)
    const query = `
      *[_type == "job" && (!defined(deadline) || deadline >= "${today}")] | order(posted desc) {
        _id,
        _createdAt,
        title,
        "slug": coalesce(slug.current, _id),
        description,
        location,
        salary,
        applyLink,
        category,
        jobType,
        posted,
        deadline,
        listingTier,
        sponsoredUntil,

        company->{
          name,
          logo
        }
      }
    `

    return await this.fetch(query)
  },

  // ===============================
  // SINGLE JOB BY SLUG
  // ===============================
  fetchJobBySlug: async function (slug) {
    const query = `
      *[_type == "job" && slug.current == "${slug}"][0]{
        _id,
        _createdAt,
        title,
        "slug": slug.current,
        description,
        location,
        salary,
        applyLink,
        category,
        jobType,
        posted,
        deadline,
        listingTier,
        sponsoredUntil,

        company->{
          name,
          logo
        }
      }
    `
    const result = await this.fetch(query)
    return result || null
  },

  // ===============================
  // IMAGE URL BUILDER
  // ===============================
  imageUrl: function (imageAsset) {
    if (!imageAsset) return null

    let ref = null
    if (imageAsset.asset && imageAsset.asset._ref) {
      ref = imageAsset.asset._ref
    } else if (imageAsset.asset && imageAsset.asset._id) {
      ref = imageAsset.asset._id
    } else if (typeof imageAsset === 'string') {
      ref = imageAsset
    }

    if (!ref) return null

    const parts = ref.split('-')
    if (parts.length < 4) return null

    const id = parts[1]
    const dimensions = parts[2]
    const format = parts[3]

    const builder = {
      _width: null,
      _height: null,
      _fit: null,
      _quality: null,

      width(w) {
        this._width = w
        return this
      },

      height(h) {
        this._height = h
        return this
      },

      fit(mode) {
        this._fit = mode
        return this
      },

      quality(q) {
        this._quality = q
        return this
      },

      url() {
        let url = `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${format}`
        const params = []

        if (this._width) params.push(`w=${this._width}`)
        if (this._height) params.push(`h=${this._height}`)
        if (this._fit) params.push(`fit=${this._fit}`)
        if (this._quality) params.push(`q=${this._quality}`)

        if (params.length) url += `?${params.join('&')}`
        return url
      }
    }

    return builder
  }
}
