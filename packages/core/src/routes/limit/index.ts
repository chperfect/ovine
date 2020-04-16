/**
 * APP 权限配置表处理
 */

import { filterTree, mapTree } from 'amis/lib/utils/helper'
import { get, map } from 'lodash'

import { routeLimitKey, strDelimiter } from '@/constants'
import { getPagePreset } from '@/routes/exports'
import * as Types from '@/utils/types'

import { getRouteConfig } from '../config'
import { Limit, LimitMenuItem, RouteItem } from '../types'

import { checkLimitByNodePath, getAppLimits } from './exports'

// 处理 preset.limits.needs 配置的数据
const resolveLimitNeeds = (key: string, limits: Types.ObjectOf<Limit>): string[] => {
  const checked: Types.ObjectOf<boolean> = {}

  const { needs = [] } = limits[key]

  // 便利所有节点
  const getNeeds = (node: string[] = []) => {
    // 防止循环依赖
    node.forEach((k: string) => {
      if (!checked[k]) {
        checked[k] = true
        getNeeds(limits[k]?.needs)
      }
    })
  }

  // 添加默认 $page 页面权限
  if (!checked[routeLimitKey]) {
    checked[routeLimitKey] = true
    needs.push(routeLimitKey)
  }

  getNeeds(needs)

  return Object.keys(checked)
}

type StoreType = {
  asideMenus: any[]
  authRoutes: any[]
  actionAddrMap: Types.ObjectOf<string>
  limitMenus: LimitMenuItem[]
}
const store: StoreType = {
  asideMenus: [],
  authRoutes: [],
  limitMenus: [],
  actionAddrMap: {},
}

// 权限配置表
export const getLimitMenus = (refresh: boolean = false) => {
  if (!refresh && store.limitMenus.length) {
    return store.limitMenus
  }

  store.limitMenus = mapTree(getRouteConfig() as LimitMenuItem[], (item) => {
    const newItem = { ...item }
    const { nodePath, nodeLabel } = newItem

    const preset = getPagePreset(item)

    const { limits, apis } = preset || {}

    // limits 表示 当前节点 有子权限
    if (limits) {
      newItem.children = map(limits, ({ icon, label, description }, key) => {
        const needs =
          key === routeLimitKey
            ? undefined
            : resolveLimitNeeds(key, limits).map((needK: string) => `${nodePath}/${needK}`)

        return {
          label,
          description,
          needs,
          icon: icon || 'fa fa-code',
          nodePath: `${nodePath}/${key}`,
        }
      })
    }

    // 将 preset 配置的 apis， 添加到权限配置表中
    if (apis) {
      const allApis: any = {}
      map(apis, (apiItem, apiKey) => {
        const { key: apiAuthKey, url, limits: apiNeeds } = apiItem
        const presetApiNeeds = typeof apiNeeds === 'string' ? [apiNeeds] : apiNeeds

        apiItem.actionAddr = `${nodePath}${strDelimiter}${presetApiNeeds?.join(',')}`

        store.actionAddrMap[
          apiItem.actionAddr
        ] = `${nodeLabel}${strDelimiter}${presetApiNeeds
          ?.map((i) => get(limits, `${i}.label`))
          .join(',')}`

        allApis[apiKey] = {
          url,
          key: apiAuthKey,
          limits: presetApiNeeds?.concat(routeLimitKey),
        }
      })
      newItem.apis = {
        ...newItem.apis,
        ...allApis,
      }
    }

    // 添加默认 icon
    newItem.icon = newItem.icon ? newItem.icon : 'fa fa-code-fork'

    // console.log('-----', routePath, newItem)
    return newItem
  })

  return store.limitMenus
}

// 过滤掉 配置路由信息
// 1. 去除无权限路由
// 2. 去除侧边栏隐藏 菜单项
const filterRoutesConfig = (type: 'aside' | 'route') => {
  const limits = getAppLimits()
  if (!Object.keys(limits).length) {
    return []
  }

  const nodes = filterTree<RouteItem>(getRouteConfig(true), ({ sideVisible, nodePath }) => {
    const auth = checkLimitByNodePath(nodePath, limits)

    if (nodePath === '/') {
      return true
    }

    switch (type) {
      case 'aside':
        return auth && sideVisible !== false
      default:
        return auth
    }
  })

  if (type === 'aside') {
    // 去除顶层 无用 label 显示
    return nodes.filter(({ nodePath, children }) => nodePath === '/' && !!children?.length)
  }

  return nodes
}

// 可用权限
export const getAuthRoutes = (): RouteItem[] => {
  if (store.authRoutes?.length) {
    return store.authRoutes
  }
  store.authRoutes = filterRoutesConfig('route') as any
  return store.authRoutes
}

// 侧边栏 展示菜单配置
export const getAsideMenus = (): RouteItem[] => {
  if (store.asideMenus?.length) {
    return store.asideMenus
  }
  store.asideMenus = filterRoutesConfig('aside') as any
  return store.asideMenus
}

// 获取地址映射关系
export const getActionAddrMap = () => store.actionAddrMap