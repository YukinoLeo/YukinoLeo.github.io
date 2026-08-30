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
// Blog categories (built from real posts)
// =====================================================

// Column metadata keyed by category name.
// Columns without an entry fall back to the generic description.
const COLUMN_META = {
  'AI基础': {
    description: 'Core concepts, foundations and essential ideas in artificial intelligence.'
  },
  'Diffusion': {
    description: 'Notes and explorations on diffusion models, generative modeling and related techniques.'
  },
  'PaperWeekly': {
    description: 'Weekly notes, discussions and interesting ideas from recently read research papers.'
  }
}

// Temporary cover for column cards (to be replaced later).
const DEFAULT_COLUMN_COVER = '/images/projects/coursemate.png'

// Generic description for columns without an entry above.
const DEFAULT_COLUMN_DESCRIPTION =
  'Articles, notes and ideas collected around this topic.'


// Turns a real Hexo post into the minimal shape the card templates need.
// Registered as a template helper so any category page (ours at /blog/:name/
// and the default hexo-generator-category ones at /categories/:name/) can
// render the horizontal cards from real posts.
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


// Derives blog categories from the real post collection.
// Must run after Hexo has loaded source posts (template_locals /
// generator callbacks), so it is computed lazily per call.
function getBlogCategories() {
  const posts = hexo.locals.get('posts').toArray()
  const categoryMap = new Map()

  posts.forEach(post => {
    const names = (post.categories && post.categories.toArray
      ? post.categories.toArray()
      : []
    ).map(category => category.name)

    names.forEach(name => {
      if (!name) return

      if (!categoryMap.has(name)) {
        categoryMap.set(name, {
          name,
          slug: name,
          posts: []
        })
      }

      categoryMap.get(name).posts.push(post)
    })
  })

  return Array.from(categoryMap.values()).map(category => ({
    ...category,
    posts: category.posts.sort(
      (a, b) => b.date.valueOf() - a.date.valueOf()
    ),
    description: COLUMN_META[category.name]
      ? COLUMN_META[category.name].description
      : DEFAULT_COLUMN_DESCRIPTION,
    cover: DEFAULT_COLUMN_COVER
  }))
}


// =====================================================
// Make collections available to templates
// =====================================================

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
