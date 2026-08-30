const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { stripHTML, truncate } = require('hexo-util')


// =====================================================
// Generic Markdown collection loader
// =====================================================

function loadCollection(hexo, collectionName) {
  const collectionDir = path.join(
    hexo.source_dir,
    `_${collectionName}`
  )

  if (!fs.existsSync(collectionDir)) {
    return []
  }

  const files = fs.readdirSync(collectionDir)
    .filter(file => file.endsWith('.md'))

  return files
    .map(file => {
      const filePath = path.join(collectionDir, file)
      const content = fs.readFileSync(filePath, 'utf8')

      const match = content.match(
        /^---\s*([\s\S]*?)\s*---/
      )

      if (!match) {
        return null
      }

      const data = yaml.load(match[1]) || {}

      return {
        ...data,
        slug: path.basename(file, '.md')
      }
    })
    .filter(Boolean)
}


// =====================================================
// Load Research / Projects collections
// =====================================================

const research = loadCollection(
  hexo,
  'research'
)

const projects = loadCollection(
  hexo,
  'projects'
)


// =====================================================
// Blog column metadata (source/_data/columns.yml)
// =====================================================

function loadColumnMeta() {
  const file = path.join(hexo.source_dir, '_data', 'columns.yml')

  if (!fs.existsSync(file)) {
    return { defaults: {}, columns: {} }
  }

  const content = fs.readFileSync(file, 'utf8')
  const data = yaml.load(content) || {}

  return {
    defaults: data.defaults || {},
    columns: data.columns || {}
  }
}

const columnMeta = loadColumnMeta()
const columnDefaults = columnMeta.defaults
const columnMap = columnMeta.columns


// =====================================================
// Column id resolution
//
// A post belongs to a column when:
//   1. it lives in a folder under source/_posts/<id>/   (folder = stable id)
//   2. and/or its front matter declares `column: <id>` / `column: [ids]`
// The union of both is used (folder = primary, front matter = supplement).
// =====================================================

function getColumnIds(post) {
  const ids = new Set()

  const src = post.source || ''
  const match = src.match(/^_posts\/([^/]+)\//)
  if (match) {
    ids.add(match[1])
  }

  let column = post.column
  if (column) {
    if (!Array.isArray(column)) {
      column = [column]
    }
    column.forEach(id => {
      if (id) {
        ids.add(String(id))
      }
    })
  }

  return Array.from(ids)
}


// Turns a real Hexo post into the minimal shape the card templates need.
// Registered as a template helper so any category page can render the
// horizontal cards from real posts.
function toPostCard(post) {
  const tags = (post.tags && post.tags.toArray
    ? post.tags.toArray()
    : []
  ).map(tag => ({
    name: tag.name,
    path: tag.path
  }))

  return {
    title: post.title || 'Untitled',
    path: post.path,
    date: post.date,
    tags,
    views: post.views || 0,
    excerpt: truncate(
      stripHTML(post.content).replace(/\n/g, ' '),
      { length: 90 }
    )
  }
}


// Derives blog columns from the real post collection, merging each
// column id with its metadata from columns.yml.
function getBlogCategories() {
  const posts = hexo.locals.get('posts').toArray()
  const categoryMap = new Map()

  posts.forEach(post => {
    getColumnIds(post).forEach(id => {
      if (!categoryMap.has(id)) {
        categoryMap.set(id, {
          id,
          posts: []
        })
      }
      categoryMap.get(id).posts.push(post)
    })
  })

  return Array.from(categoryMap.values()).map(category => {
    const meta = columnMap[category.id] || {}

    return {
      id: category.id,
      slug: category.id,
      name: meta.name || category.id,
      cover: meta.cover || columnDefaults.cover,
      description: meta.description || columnDefaults.description,
      posts: category.posts.sort(
        (a, b) => b.date.valueOf() - a.date.valueOf()
      )
    }
  })
}


// Template helper: post -> { title, path, date, tags, views, excerpt }
hexo.extend.helper.register('postCard', (post) => toPostCard(post))


hexo.extend.filter.register(
  'template_locals',
  function (locals) {

    locals.research = research
    locals.projects = projects
    locals.blogCategories = getBlogCategories()

    return locals
  }
)


// =====================================================
// Generate Research / Projects / Blog pages
// =====================================================

hexo.extend.generator.register(
  'content-collections',
  function () {

    const categories = getBlogCategories()

    const routes = [

      // -------------------------------------------------
      // Research
      // -------------------------------------------------

      {
        path: 'research/index.html',

        data: {
          title: 'Research',
          type: 'research',
          aside: true,
          research
        },

        layout: 'research'
      },


      // -------------------------------------------------
      // Projects
      // -------------------------------------------------

      {
        path: 'projects/index.html',

        data: {
          title: 'Projects',
          type: 'projects',
          aside: true,
          projects
        },

        layout: 'projects'
      },


      // -------------------------------------------------
      // Blog column station
      // -------------------------------------------------

      {
        path: 'blog/index.html',

        data: {
          title: 'Blog',
          type: 'blog',
          aside: true,
          blogCategories: categories
        },

        layout: 'blog'
      }

    ]


    // ---------------------------------------------------
    // Blog category pages
    // ---------------------------------------------------

    categories.forEach(category => {

      routes.push({

        path: `blog/${category.slug}/index.html`,

        data: {
          title: category.name,
          type: 'category',
          category: category.name,
          posts: category.posts,
          aside: false
        },

        layout: 'category'
      })

    })


    return routes
  }
)
