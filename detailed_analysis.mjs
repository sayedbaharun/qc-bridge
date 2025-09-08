import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🔍 DETAILED DATABASE ANALYSIS FOR MIGRATION');
console.log('============================================\n');

// Function to get table schema
async function getTableSchema(tableName) {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', tableName)
      .eq('table_schema', 'public');
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Could not fetch schema for ${tableName}:`, error.message);
    return null;
  }
}

// Get raw table data with all columns
async function getRawTableData(tableName, limit = null) {
  try {
    let query = supabase.from(tableName).select('*');
    if (limit) query = query.limit(limit);
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Could not fetch data from ${tableName}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('1. TABLE SCHEMAS');
  console.log('================\n');
  
  // Get schemas for key tables
  const tables = ['brands', 'projects', 'tasks', 'milestones'];
  const schemas = {};
  
  for (const table of tables) {
    console.log(`${table.toUpperCase()} TABLE SCHEMA:`);
    const schema = await getTableSchema(table);
    schemas[table] = schema;
    
    if (schema) {
      schema.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
    } else {
      console.log('  Could not retrieve schema');
    }
    console.log('');
  }
  
  console.log('2. RAW DATA ANALYSIS');
  console.log('====================\n');
  
  // Get raw data from each table
  console.log('BRANDS TABLE:');
  const brands = await getRawTableData('brands');
  console.log(`Found ${brands.length} brands:`);
  brands.forEach(brand => {
    console.log(`  ${JSON.stringify(brand, null, 2)}`);
  });
  console.log('');
  
  console.log('PROJECTS TABLE:');
  const projects = await getRawTableData('projects');
  console.log(`Found ${projects.length} projects:`);
  projects.forEach(project => {
    console.log(`  ${JSON.stringify(project, null, 2)}`);
  });
  console.log('');
  
  console.log('SAMPLE TASKS:');
  const tasks = await getRawTableData('tasks', 5);
  console.log(`Sample of ${tasks.length} tasks:`);
  tasks.forEach(task => {
    console.log(`  ${JSON.stringify(task, null, 2)}`);
  });
  console.log('');
  
  console.log('MILESTONES:');
  const milestones = await getRawTableData('milestones');
  console.log(`Found ${milestones.length} milestones:`);
  milestones.forEach(milestone => {
    console.log(`  ${JSON.stringify(milestone, null, 2)}`);
  });
  console.log('');
  
  // Analyze relationships
  console.log('3. RELATIONSHIP ANALYSIS');
  console.log('========================\n');
  
  // Check brand-project relationships
  console.log('BRAND-PROJECT RELATIONSHIPS:');
  const brandIds = new Set(brands.map(b => b.id));
  const projectBrandIds = new Set(projects.map(p => p.brand_id).filter(Boolean));
  
  console.log(`Total brands: ${brandIds.size}`);
  console.log(`Unique brand_ids in projects: ${projectBrandIds.size}`);
  console.log(`Brands referenced by projects: ${[...projectBrandIds].map(id => {
    const brand = brands.find(b => b.id === id);
    return brand ? brand.name : `Unknown(${id})`;
  }).join(', ')}`);
  
  // Check for orphaned projects
  const orphanedProjects = projects.filter(p => p.brand_id && !brandIds.has(p.brand_id));
  console.log(`Orphaned projects (brand_id not in brands table): ${orphanedProjects.length}`);
  
  // Check for unused brands
  const unusedBrands = brands.filter(b => !projectBrandIds.has(b.id));
  console.log(`Unused brands (no projects reference them): ${unusedBrands.length}`);
  if (unusedBrands.length > 0) {
    unusedBrands.forEach(brand => {
      console.log(`  - ${brand.name} (${brand.id})`);
    });
  }
  console.log('');
  
  // Check project-task relationships
  console.log('PROJECT-TASK RELATIONSHIPS:');
  const allTasks = await getRawTableData('tasks');
  const projectIds = new Set(projects.map(p => p.id));
  const taskProjectIds = new Set(allTasks.map(t => t.project_id).filter(Boolean));
  
  console.log(`Total projects: ${projectIds.size}`);
  console.log(`Unique project_ids in tasks: ${taskProjectIds.size}`);
  console.log(`Projects with tasks: ${taskProjectIds.size}`);
  console.log(`Tasks without project: ${allTasks.filter(t => !t.project_id).length}`);
  
  // Task distribution by project
  const tasksByProject = {};
  allTasks.forEach(task => {
    const projectId = task.project_id || 'no-project';
    tasksByProject[projectId] = (tasksByProject[projectId] || 0) + 1;
  });
  
  console.log('\\nTask distribution:');
  Object.entries(tasksByProject).forEach(([projectId, count]) => {
    if (projectId === 'no-project') {
      console.log(`  No project: ${count} tasks`);
    } else {
      const project = projects.find(p => p.id === projectId);
      const brand = project ? brands.find(b => b.id === project.brand_id) : null;
      console.log(`  ${project?.name || 'Unknown project'} (${brand?.name || 'No brand'}): ${count} tasks`);
    }
  });
  
  console.log('\\n4. MIGRATION READINESS ASSESSMENT');
  console.log('==================================');
  
  console.log('CRITICAL FINDINGS:');
  console.log('• Current structure: brands → projects → tasks');
  console.log('• Proposed structure: task_types → projects → tasks');
  console.log('• All existing brands should become projects under "business" task_type');
  console.log('• Need to handle data integrity during migration');
  
  console.log('\\nRECOMMENDED MIGRATION STEPS:');
  console.log('1. Backup database');
  console.log('2. Create task_types table');
  console.log('3. Insert "business" and "personal" task types');
  console.log('4. Add task_type_id column to projects table');
  console.log('5. Set all existing projects to "business" task_type');
  console.log('6. Update application code to use task_types');
  console.log('7. Remove brand_id column and brands table');
  
}

main().catch(console.error);