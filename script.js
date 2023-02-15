import { h, app, text } from 'https://unpkg.com/hyperapp'
import router from 'https://unpkg.com/page/page.mjs'

let fixRoute = (route) => (window.location.pathname === '/' ? '' : window.location.pathname) + route

let createConceptInstance = (conceptName, conceptId) => ({
    id: conceptId,
    priority: 3,
    conceptName: conceptName,
    relationshipIds: []
})

let addConcept = (state, conceptName) => ({
    ...state, 
    data: {
        ...state.data,
        concepts: state.data.concepts.concat(createConceptInstance(conceptName, state.data.ids.nextConceptId)),
        ids: {
            ...state.data.ids,
            nextConceptId: state.data.ids.nextConceptId + 1
        }
    }
})

let addRelationship = (state, [ concept0Id, concept1Id ]) => ({
    ...state,
    data: {
        ...state.data,
        concepts: state.data.concepts.map(concept => {
            if(concept.id !== concept0Id && concept.id !== concept1Id) return concept
            return { ...concept, relationshipIds: concept.relationshipIds.concat(state.data.ids.nextRelationshipId) }
        }),
        relationships: state.data.relationships.concat({
            id: state.data.ids.nextRelationshipId,
            memberIds: [concept0Id, concept1Id],
            definitionIds: []
        }),
        ids: {
            ...state.data.ids,
            nextRelationshipId: state.data.ids.nextRelationshipId + 1
        }
    }
})

let initConcept = (state, conceptId) => state.data.concepts.reduce((endState, otherConcept) => {
    if(conceptId === otherConcept.id) return endState
    return addRelationship(endState, [conceptId, otherConcept.id])
}, state)

let addDefintion = (state, { relationshipId, content, confidence }) => ({
    ...state,
    current: {
        ...state.current,
        recentlyDefined: (() => {
            console.log(state.current.recentlyDefined)
            let n = state.current.recentlyDefined.concat(getRelationshipById(state, relationshipId).memberIds)
            if(n.length > Math.floor(state.data.concepts.length / 2)) return n.slice(2)
            return n
        })()
    },
    data: {
        ...state.data,
        relationships: state.data.relationships.map(relationship => {
            if(relationship.id !== relationshipId) return relationship
            return {
                ...relationship,
                definitionIds: relationship.definitionIds.concat(state.data.ids.nextDefinitionId)
            }
        }),
        definitions: state.data.definitions.concat({
            id: state.data.ids.nextDefinitionId,
            content: content,
            confidence: confidence,
            created: Date.now()
        }),
        ids: {
            ...state.data.ids,
            nextDefinitionId: state.data.ids.nextDefinitionId + 1
        }
    }
})

let getConceptById = (state, conceptId) => state.data.concepts.find(c => c.id === conceptId)
let getRelationshipById = (state, relationshipId) => state.data.relationships.find(r => r.id === relationshipId)
let getDefinitionById = (state, definitionId) => state.data.definitions.find(d => d.id === definitionId)

let getRelationshipConfidence = (state, relationshipId) => {
    if (getRelationshipById(state, relationshipId).definitionIds.length === 0) 
        return 0
    let total = getRelationshipById(state, relationshipId).definitionIds.reduce(
        (total, defId) => 
            total + getDefinitionById(state, defId).confidence, 0)
    return total / getRelationshipById(state, relationshipId).definitionIds.length
}

let getConceptConfidence = (state, conceptId) => {
    let concept = getConceptById(state, conceptId)
    let total = concept.relationshipIds.reduce(
        (total, rId) => 
            total + getRelationshipConfidence(state, rId), 0)
    return total / concept.relationshipIds.length || 50
}

//higher score === less likely to pop up
//picking order is lowest to highest scored
//priority lowers score because itll put it down
let scoreConcept = (state, conceptId) => {
    let concept = getConceptById(state, conceptId)
    return 4 - (1.5 * concept.priority) + (0.1 * getConceptConfidence(state, concept.id))
}

let getNewestDefintionId = (state, relationshipId) => {
    let r = getRelationshipById(state, relationshipId)
    return r.definitionIds.at(-1)
}

let getMostNeglectedRelationship = (state, conceptId) => {
    let concept = getConceptById(state, conceptId)
    return concept.relationshipIds.map(rid => {
        if(getRelationshipById(state, rid).definitionIds.length === 0) return [0, rid]
        let newestDef = getDefinitionById(state, getNewestDefintionId(state, rid))
        return [newestDef.created, rid]
    }).filter(tuple => {
        let r = getRelationshipById(state, tuple[1])
        return !state.current.recentlyDefined.some(e => r.memberIds.includes(e))
    }).sort((tupleA, tupleB) => tupleA[0] - tupleB[0])[0][1]
}

let getNextRelationshipToDefine = (state) => {
    console.log(
    state.data.concepts.map(concept => [scoreConcept(state, concept.id), concept.id])
        .sort((tupleA, tupleB) => tupleA[0] - tupleB[0])
    )
    return getMostNeglectedRelationship(state,
    state.data.concepts.map(concept => [scoreConcept(state, concept.id), concept.id])
        .sort((tupleA, tupleB) => tupleA[0] - tupleB[0])
        .find(tuple => !state.current.recentlyDefined.includes(tuple[1]))[1])
}


let initialstate = {
    current: {
        route: fixRoute('/'),
        focusedRelationshipId: -1,
        focusedConceptId: -1,
        hamburger: false,
        recentlyDefined: [],
    },
    data: {
        ids: {
            nextConceptId: 0,
            nextDefinitionId: 0,
            nextRelationshipId: 0
        },
        concepts: [],
        definitions: [],
        relationships: []
    }
}

let pDefaultCallback = (callback, props = null) => (state, e) => [
    state,
    [(dispatch) => (e.preventDefault(), dispatch(callback, props !== null ? {...props, e: e } : e))]
]

let importConcepts = (state, e) => {
    return (new FormData(e.target)).get('importField').split('\n')
        .filter(e => e !== '').reduce((endState, conceptName) => {
            let currentState = addConcept(endState, conceptName)
            return initConcept(currentState, currentState.data.ids.nextConceptId - 1)
        }, state)
}

let importConceptsView = (state) => h('div', {class: 'container is-fluid'}, [
    h('div', {}, [
        h('button', { onclick: importData, class:'button'}, text('Import Data From File')),
        h('button', { onclick: exportData, class:'button'}, text('Export Data To File')),
    ]),
    h('div', {}, [
        h('form', {onsubmit: pDefaultCallback(importConcepts)}, [
            h('div', {class: 'field'}, [
                h('label', {for: 'importField'}, text('Paste new concepts here:')),
                h('textarea', {name: 'importField', id: 'importField', rows: 10, class: 'textarea'}, text('')),
                h('input', {type: 'submit', class: 'button'}, text('Import concepts'))
            ])
        ])
    ])
])

let deleteConcept = (state, { conceptId }) => ({
    ...state,
    current: {
        ...state.current,
        focusedConceptId: conceptId === state.current.focusedConceptId ? -1 : state.current.focusedConceptId,
        focusedRelationshipId: (() => {
            if(state.current.focusedRelationshipId === -1) return -1
            if(getRelationshipById(state, state.current.focusedRelationshipId).memberIds.includes(conceptId))
                return -1
            return state.current.focusedRelationshipId
        })()
    },
    data: {
        ...state.data,
        concepts: state.data.concepts.filter(c => c.id !== conceptId)
            .map(c => ({
                ...c,
                relationshipIds: c.relationshipIds.filter(rId => {
                    return !getRelationshipById(state, rId).memberIds.includes(conceptId)
                })
            })),
        relationships: state.data.relationships.filter(r => !r.memberIds.includes(conceptId))
    }
})

let setFocusedConcept = (state, conceptId) => ({
    ...state,
    current: {
        ...state.current,
        focusedConceptId: conceptId
    }
})

//import data (action)
//import data (effect)
//bring up file menu (effector)
//put data from file into data (action)

//export data (action)
//put data into blob and save (effector)

let exportDataEffector = (dispatch, { data }) => {
    let downloadLink = document.createElement('a')
    let file = new Blob([JSON.stringify(data)], {type:'application/json'})
    downloadLink.href = URL.createObjectURL(file)
    downloadLink.download = 'notes.json'
    downloadLink.click()
}
let exportData = (state) => [state, [exportDataEffector, { data: state.data }]]

let importFromFileData = (state, jsonString) => ({...state, data: JSON.parse(jsonString)})
let importDataEffector = (dispatch, props) => {
    let uploadInput = document.createElement('input')
    uploadInput.type = 'file'
    uploadInput.accept = '.json'

    uploadInput.onchange = e => {
        let file = e.target.files[0]

        let reader = new FileReader()

        reader.readAsText(file)
        reader.onload = e => {
            dispatch(importFromFileData, e.target.result)
        }
    }
    uploadInput.click()
}
let importData = (state) => [state, [importDataEffector, {}]]

let genUniq = (callback, id) => (state, e) => [callback, {id: id, e: e}]

let setPrio = (state, { id, e }) => ({
    ...state,
    data: {
        ...state.data,
        concepts: state.data.concepts.map(c => {
            if(c.id !== id) return c
            console.log(e)
            return {...c, priority: e.target.value}
        })
    }
})

let conceptsListView = (state) => h('div', {class: 'container is-fluid'},  [
    text('Concepts: '),
    h('ol', {}, [
        ...state.data.concepts.sort((a, b) => {
            return scoreConcept(state, b.id) - scoreConcept(state, a.id)
        }).map(concept => h('li', {}, [
            h('div', { class: 'conceptInList'}, [
                h('a', { href: fixRoute('/concept/') + concept.id}, [
                    text(concept.conceptName),
                ]),
                h('input', {onchange: genUniq(setPrio, concept.id), type: 'range', min: '1', max: '5', step: 1, value: concept.priority}, ),
                h('button', { onclick: [deleteConcept, { conceptId: concept.id }], class: 'button'}, text('Remove'))
            ])
        ]))
    ])
])

let resetContent = (dispatch, props) => {
    props.e.value = ''
}

let addDefintionFromForm = (state, e) => {
    let formData = new FormData(e.target)
    return [addDefintion(state, {
        relationshipId: parseInt(formData.get('relationshipId')),
        content: formData.get('definitionContent'),
        confidence: parseInt(formData.get('confidence'))
    }), [resetContent, {e: e.target.firstChild}]]
}

let defineView = (state, relationshipId) => h('div', {}, (() => {
    let concept0 = getConceptById(state, getRelationshipById(state, relationshipId).memberIds[0])
    let concept1 = getConceptById(state, getRelationshipById(state, relationshipId).memberIds[1])
    return [
        h('h1', { class: 'title' }, 
            text('Define the relationship between ' + 
                concept0.conceptName +
                ' and ' +
                concept1.conceptName
                )),
        h('form', { 
            onsubmit: pDefaultCallback(addDefintionFromForm)
        }, [
            h('textarea', { 
                name: 'definitionContent', 
                class: 'textarea',
                id: 'defintionContent',
                placeholder: 'New Definition...',
                rows: 10,
                cols: 100
            }, text('')),
            h('input', {
                name: 'confidence',
                id: 'confidenceSlider',
                type: 'range',
                min: 0,
                max: 100,
                step: 10,
                value: 50,
            }, text('')),
            h('input', {
                type: 'hidden',
                name: 'relationshipId',
                value: relationshipId
            }, text('')),
            h('input', {
                type: 'submit',
                class: 'button'
            }, text('Submit New Definition'))
        ])
    ]
})())

let defineNextView = (state) => h('div', {class: 'container is-fluid'},
    state.data.concepts.length < 2 ? text('Not enough concepts!') : defineView(state, getNextRelationshipToDefine(state)))

let focusedRelationshipView = (state) => h('div', {}, (() => {
    let relationship = getRelationshipById(state, state.current.focusedRelationshipId)
    let concept0 = getConceptById(state, relationship.memberIds[0])
    let concept1 = getConceptById(state, relationship.memberIds[1])
    return h('div', {}, [
        text('Relationship between ' + 
        concept0.conceptName +
        ' and ' +
        concept1.conceptName),
        h('div', {}, [
            text('Definitions: '),
            h('ul', {},
                relationship.definitionIds.map(defId => {
                    let definition = getDefinitionById(state, defId)
                    return h('li', {}, [
                        text('Submitted: ' + (new Date(definition.created)).toLocaleString()),
                        text('Content: ' + definition.content),
                        text('Confidence: ' + definition.confidence)
                    ])
                })
            )
        ])
    ])
})())

let setFocusedRelationship = (state, relationshipId) => ({
    ...state,
    current: {
        ...state.current,
        focusedRelationshipId: relationshipId
    }
})

let focusedConceptView = (state) => {
    if(state.current.focusedConceptId === -1) return text('no focused concept yet')
    let concept = getConceptById(state, state.current.focusedConceptId)
    return h('div', {}, [
        h('h1', {}, text('Relationships with: ')),
        h('ol', {}, concept.relationshipIds.map(rId => {
            let relationship = getRelationshipById(state, rId)
            let otherConceptId = relationship.memberIds[0] === concept.id ? 
                relationship.memberIds[1] : relationship.memberIds[0]
            let otherConcept = getConceptById(state, otherConceptId)
            return h('li', {}, [
                h('a', { href: fixRoute('/relationship/') + relationship.id}, [
                    h('div', {}, [
                        text(otherConcept.conceptName),
                        text('Confidence: ' + getRelationshipConfidence(state, relationship.id) + '%')
                    ])
                ])
            ])
        }))
    ])
}

let routes = {
    '/': defineNextView,
    '/importConcepts': importConceptsView,
    '/conceptsList': conceptsListView,
    '/relationship/:relationshipId': focusedRelationshipView,
    '/concept/:conceptId':  focusedConceptView
}
Object.keys(routes).forEach(route => { 
    if(route === fixRoute(route)) return
    routes[fixRoute(route)] = routes[route]
    delete routes[route]
})

let toggleHamburger = (state) => ({...state, current: {...state.current, hamburger: !state.current.hamburger}})

let topView = (state) => h('div', {}, [
    h('nav', {
        class: 'navbar', 
        role: 'navigation',
        'aria-label': 'main navigation'
    }, [
        h('div', { class: 'navbar-brand' }, [
            h('a', {
                role: 'button',
                class: 'navbar-burger ' + (state.current.hamburger === true ? 'is-active' : ''),
                'aria-label': 'menu',
                'data-target': 'topNavMenu',
                onclick: toggleHamburger
            }, [
                h('span', { 'aria-hidden': 'true' }, text('')),
                h('span', { 'aria-hidden': 'true' }, text('')),
                h('span', { 'aria-hidden': 'true' }, text('')),
            ])
        ]),
        h('div', { 
            class:'navbar-menu ' + (state.current.hamburger === true ? 'is-active' : ''),
            id:'topNavMenu'
         }, [
            h('div', { 
                class:'navbar-start', 
            }, [
                h('a', { 
                    href: fixRoute('/'), 
                    class: 'navbar-item'
                }, text('Home')),
                h('a', { 
                    href: fixRoute('/importConcepts'),
                    class: 'navbar-item'
                }, text('Import some concepts')),
                h('a', { 
                    href: fixRoute('/conceptsList'),
                    class: 'navbar-item'
                }, text('Your concepts')),
            ])
        ]),
    ]),
    routes[state.current.route](state)
])

let pageJsHandler = (c, next) => {
    dispatchEvent(new CustomEvent('pagejsroute', { detail: { c: c} }))
}

Object.keys(routes).forEach(route => router(route, pageJsHandler))
router({hashbang: true})

let changeRoute = (state, { route, params }) => ({
    ...state,
    current: {
        ...state.current,
        route: route,
        focusedRelationshipId: params['relationshipId'] !== undefined ? parseInt(params['relationshipId']) : state.current.focusedConceptId,
        focusedConceptId: params['conceptId'] !== undefined ? parseInt(params['conceptId']) : state.current.focusedConceptId,
    }
})

let pagejsSubscriber = (dispatch, props) => {
    let handler = (e) => {
        dispatch(changeRoute, {route: e.detail.c.routePath, params: e.detail.c.params})
    }
    addEventListener('pagejsroute', handler)
    return () => removeEventListener('pagejsroute', handler)
}

app({
    init: initialstate,
    view: topView,
    node: document.getElementById('app'),
    subscriptions: () => [
        [pagejsSubscriber, {}]
    ]
})