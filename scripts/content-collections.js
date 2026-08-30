const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')


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
// Load Blog categories
// =====================================================

function loadBlogCategories(hexo) {
  const postsDir = path.join(
    hexo.source_dir,
    '_posts'
  )

  if (!fs.existsSync(postsDir)) {
    return []
  }

  const files = fs.readdirSync(postsDir)
    .filter(file => file.endsWith('.md'))

  const categoryMap = new Map()

  files.forEach(file => {

    const filePath = path.join(postsDir, file)
    const content = fs.readFileSync(filePath, 'utf8')

    const match = content.match(
      /^---\s*([\s\S]*?)\s*---/
    )

    if (!match) {
      return
    }

    const data = yaml.load(match[1]) || {}

    let categories = data.categories || []

    // Allow:
    //
    // categories:
    //   - AI基础
    //   - Diffusion
    //
    // or:
    //
    // categories: AI基础

    if (!Array.isArray(categories)) {
      categories = [categories]
    }

    categories.forEach(category => {

      if (!category) {
        return
      }

      category = String(category)

      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          name: category,
          slug: category,
          posts: []
        })
      }

      categoryMap.get(category).posts.push({
        ...data,
        slug: path.basename(file, '.md')
      })
    })
  })

  return Array.from(categoryMap.values())
}


// =====================================================
// Load blog categories once during initialization
// =====================================================

const blogCategories = loadBlogCategories(hexo)


// =====================================================
// Make collections available to templates
// =====================================================

hexo.extend.filter.register(
  'template_locals',
  function (locals) {

    locals.research = research
    locals.projects = projects
    locals.blogCategories = blogCategories

    return locals
  }
)


// =====================================================
// Generate Research / Projects / Blog Category pages
// =====================================================

hexo.extend.generator.register(
  'content-collections',
  function () {

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
      }

    ]


    // ---------------------------------------------------
    // Blog category pages
    // ---------------------------------------------------

    blogCategories.forEach(category => {

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