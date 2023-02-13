import { h, app, text } from 'https://unpkg.com/hyperapp'
import page from 'https://unpkg.com/page/page.mjs'

let createConceptInstance = (conceptName, conceptId) => ({
    id: conceptId,
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

let getConceptConfidence = (state, conceptId) => 
    getConceptById(state, conceptId).relationshipIds.reduce((total, rId) => 
    total + getRelationshipConfidence(state, rId), 0) /
    getConceptById(state, conceptId).relationshipIds.length

let getWeakestConceptId = (state) => {
    return state.data.concepts.sort((conceptA, conceptB) => 
    getConceptConfidence(state, conceptA.id) - getConceptConfidence(state, conceptB.id))[0].id
}

let getWeakestRelationshipId = (state, conceptId, index = 0) => {
    return getConceptById(state, conceptId).relationshipIds.sort((idA, idB) => 
    getRelationshipConfidence(state, idB) - getRelationshipConfidence(state, idA))[index]
}

let getNextRelationshipToDefine = (state, conceptId) => {
    return getWeakestRelationshipId(state, conceptId, 0)
}

let initialstate = {
    current: {
        focusedRelationshipId: -1,
        focusedConceptId: -1
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

let importConceptsView = (state) => h('div', {}, [
    h('button', { onclick: importData }, text('Import Data From File')),
    h('button', { onclick: exportData }, text('Export Data To File')),
    h('form', {onsubmit: pDefaultCallback(importConcepts)}, [
        h('label', {for: 'importField'}, text('Paste new concepts here:')),
        h('textarea', {name: 'importField', id: 'importField', rows: 20}, text('')),
        h('input', {type: 'submit'}, text('Import concepts'))
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


let conceptsListView = (state) => h('div', {},  [
    text('Concepts'),
    h('ol', {}, [
        ...state.data.concepts.sort((a, b) => {
            return getConceptConfidence(state, b.id) - getConceptConfidence(state, a.id)
        }).map(concept => h('li', {onclick: [setFocusedConcept, concept.id]}, [
            text(concept.conceptName),
            h('button', { onclick: [deleteConcept, { conceptId: concept.id }]}, text('Remove'))
        ]))
    ])
])

let addDefintionFromForm = (state, e) => {
    let formData = new FormData(e.target)
    return addDefintion(state, {
        relationshipId: parseInt(formData.get('relationshipId')),
        content: formData.get('definitionContent'),
        confidence: parseInt(formData.get('confidence'))
    })
}

let defineView = (state, relationshipId) => h('div', {}, (() => {
    let concept0 = getConceptById(state, getRelationshipById(state, relationshipId).memberIds[0])
    let concept1 = getConceptById(state, getRelationshipById(state, relationshipId).memberIds[1])
    return [
        h('h1', {}, 
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
                id: 'defintionContent'
            }, text('New definition...')),
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
            }, text('Submit New Definition'))
        ])
    ]
})())

let defineNextView = (state) => h('div', {},
    state.data.concepts.length < 2 ? text('Not enough concepts!') : defineView(state, getNextRelationshipToDefine(state, getWeakestConceptId(state)))
)

let focusedRelationshipView = (state) => h('div', {}, (() => {
    if(state.current.focusedRelationshipId === -1) return text('no focused relationship yet')
    let relationship = getRelationshipById(state, state.current.focusedRelationshipId)
    console.log(relationship)
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
    if(concept === undefined) return text('no focused concept yet')
    return h('div', {}, [
        h('h1', {}, text('Relationships with: ')),
        h('ol', {}, concept.relationshipIds.map(rId => {
            let relationship = getRelationshipById(state, rId)
            let otherConceptId = relationship.memberIds[0] === concept.id ? 
                relationship.memberIds[1] : relationship.memberIds[0]
            let otherConcept = getConceptById(state, otherConceptId)
            return h('li', {}, [
                h('div', { onclick: [setFocusedRelationship, relationship.id]}, [
                    text(otherConcept.conceptName),
                    text('Confidence: ' + getRelationshipConfidence(state, relationship.id) + '%')
                ])
            ])
        }))
    ])
}


let topView = (state) => h('div', {}, [
    importConceptsView(state),
    conceptsListView(state),
    defineNextView(state),
    focusedRelationshipView(state),
    focusedConceptView(state)
])

app({
    init: initialstate,
    view: topView,
    node: document.getElementById('app')
})