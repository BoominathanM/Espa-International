// Branch utility functions

// Get all branches
// In production, this would fetch from an API
export const getBranches = () => {
  try {
    // Try to get from localStorage (synced from Branch settings)
    const storedBranches = localStorage.getItem('crm_branches')
    if (storedBranches) {
      return JSON.parse(storedBranches)
    }
  } catch (error) {
    console.error('Error parsing stored branches:', error)
  }
  
  // Default mock branches
  return [
    {
      key: '1',
      name: 'Branch 1',
      value: 'Branch 1',
      label: 'Branch 1',
    },
    {
      key: '2',
      name: 'Branch 2',
      value: 'Branch 2',
      label: 'Branch 2',
    },
    {
      key: '3',
      name: 'Branch 3',
      value: 'Branch 3',
      label: 'Branch 3',
    },
    {
      key: '4',
      name: 'Branch 4',
      value: 'Branch 4',
      label: 'Branch 4',
    },
    {
      key: 'all',
      name: 'All Branches',
      value: 'all',
      label: 'All Branches',
    },
  ]
}

// Get branch options for Select component
export const getBranchOptions = () => {
  const branches = getBranches()
  return branches.map((branch) => ({
    value: branch.value || branch.name,
    label: branch.label || branch.name,
  }))
}
